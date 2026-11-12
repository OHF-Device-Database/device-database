import { ENOENT } from "node:constants";
import { randomUUID } from "node:crypto";
import {
	constants,
	lstatSync,
	mkdirSync,
	readlinkSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { copyFile, readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { logger as parentLogger } from "../../logger";
import {
	bake,
	type DatabaseDescriptorBaked,
	peek as peekDescriptor,
} from "./base";

const logger = parentLogger.child({ label: "db-domain" });

/** symlink that every connection is opened through */
const current = "current";
/** generation the layout is seeded with */
const initial = "initial";
/** directory holding every generation but {@link initial} */
const generation = "generation";
/** database file within a generation directory */
const file = "db";

export class DatabaseDomainCurrentNotLinkError extends Error {
	constructor(public path: string) {
		super(`<${path}> exists but is not a symlink`);
		Object.setPrototypeOf(this, DatabaseDomainCurrentNotLinkError.prototype);
	}
}

const isENOENT = (e: unknown) =>
	typeof e === "object" && e !== null && "errno" in e && e.errno === -ENOENT;

const DatabaseDomainGenerationSealedSymbol = Symbol(
	"DatabaseDomainGenerationSealedSymbol",
);

export type DatabaseDomainGenerationContents = Readonly<{
	/** name of the generation within the domain */
	id: string;
	/** path of the generation directory, relative to the domain root */
	target: string;
	/** absolute path of the directory the database is reached through */
	path: string;
	/** absolute path of the database within {@link path} */
	location: string;
	descriptor: DatabaseDescriptorBaked;
}>;

/** generation directory within a {@link DatabaseDomain} */
export type DatabaseDomainGeneration = Readonly<{
	[DatabaseDomainGenerationSealedSymbol]: DatabaseDomainGenerationContents;
}>;

export const peek = (
	generation: DatabaseDomainGeneration,
): DatabaseDomainGenerationContents =>
	generation[DatabaseDomainGenerationSealedSymbol];

/**
 * generational, symlink-swapped layout of a single database domain
 *
 * ```plain
 * <root>
 * ├── current -> generation/a1e1085f-5c3f-4733-bc64-14d25d8317e5
 * ├── generation
 * │   └── a1e1085f-5c3f-4733-bc64-14d25d8317e5
 * │       ├── db
 * │       ├── db-shm
 * │       └── db-wal
 * └── initial
 *     ├── db
 *     ├── db-shm
 *     └── db-wal
 * ```
 */
export class DatabaseDomain {
	constructor(
		public readonly root: string,
		/** controls what a connection may do, layout itself is still laid out and swapped */
		public readonly readOnly: boolean = false,
	) {}

	/**
	 * mints a handle on the generation `target` names, reached through `path`
	 *
	 * the two only come apart for {@link current}, see {@link live}
	 */
	private seal(
		id: string,
		target: string,
		path: string = join(this.root, target),
	): DatabaseDomainGeneration {
		const location = join(path, file);

		return {
			[DatabaseDomainGenerationSealedSymbol]: {
				id,
				target,
				path,
				location,
				descriptor: bake({ location, readOnly: this.readOnly }),
			},
		};
	}

	/**
	 * generation `target` names, reached through the {@link current} link rather than through its
	 * own directory
	 *
	 * SQLite resolves the link on every open, so a connection opened against it keeps tracking
	 * whichever generation the link is pointed at
	 */
	private live(target: string): DatabaseDomainGeneration {
		return this.seal(basename(target), target, join(this.root, current));
	}

	/** generation {@link current} points at */
	get current(): DatabaseDomainGeneration | undefined {
		const link = join(this.root, current);

		// `lstat` rather than `stat`, a dangling `current` must not read as absent
		if (typeof lstatSync(link, { throwIfNoEntry: false }) === "undefined") {
			return undefined;
		}

		return this.live(readlinkSync(link));
	}

	/**
	 * path of the live database with every link resolved, which is the file a connection opened
	 * through {@link current} ends up holding on to
	 *
	 * `undefined` when the layout has not been bootstrapped, or while a swap is in flight
	 */
	get resolved(): string | undefined {
		const live = this.current;
		if (typeof live === "undefined") {
			return undefined;
		}

		try {
			return realpathSync(peek(live).location);
		} catch (e) {
			if (!isENOENT(e)) {
				throw e;
			}

			return undefined;
		}
	}

	/**
	 * brings layout into state where `current` is a symlink to a generation holding a database
	 *
	 * when `current` is absent, `initial` and the database inside are created first when not already present
	 * only after that `current` is pointed at it
	 *
	 * links within a generation are followed
	 *
	 * idempotent
	 */
	bootstrap(): DatabaseDomainGeneration {
		mkdirSync(join(this.root), { recursive: true });
		mkdirSync(join(this.root, generation), { recursive: true });

		const link = join(this.root, current);

		// `lstat` rather than `stat`: dangling `current` must not read as absent
		const stat = lstatSync(link, { throwIfNoEntry: false });
		if (typeof stat !== "undefined" && !stat.isSymbolicLink()) {
			throw new DatabaseDomainCurrentNotLinkError(link);
		}

		const existing = this.current;
		if (typeof existing !== "undefined") {
			return existing;
		}

		const seed = this.seal(initial, initial);
		const { path, location, target } = peek(seed);

		// may well exist already, holding a database that predates the layout
		mkdirSync(path, { recursive: true });

		// creates database file
		// also performed for read-only domain as sqlite does not create database file in read-only mode
		new DatabaseSync(new URL(peekDescriptor(bake({ location })))).close();

		this.point(seed);

		logger.info(`seeded <${this.root}> with <${initial}>`, {
			root: this.root,
			generation: initial,
		});

		return this.live(target);
	}

	/**
	 * creates a generation holding a copy of the database reached through {@link current}
	 *
	 * the only way to come by a generation — one that does not carry the live database over would
	 * drop everything written so far the moment it is {@link point - pointed} at
	 *
	 * the copy is taken at the file system level rather than through SQLite — `vacuum into` reads
	 * and rewrites every page, whereas a reflink hands the pages over without moving any bytes at
	 * all on a file system that supports copy-on-write (apfs, btrfs, xfs, zfs); where it is not
	 * supported the kernel falls back to a plain copy, hence `FICLONE` rather than `FICLONE_FORCE`
	 *
	 * the write-ahead log is copied alongside the database, it generally holds transactions that
	 * have not been checkpointed into the database file yet; the shared-memory index is not, SQLite
	 * rebuilds it from the log when the copy is opened
	 *
	 * the two files are copied one after the other, neither copy being atomic in itself:
	 * **the database must not be written to for the duration**, the copy is otherwise torn
	 */
	async clone(id: string = randomUUID()): Promise<DatabaseDomainGeneration> {
		const cloned = this.seal(id, join(generation, id));
		const { path, location: destination, target } = peek(cloned);

		mkdirSync(path, { recursive: true });

		const source = join(this.root, current, file);

		try {
			await copyFile(source, destination, constants.COPYFILE_FICLONE);

			try {
				await copyFile(
					`${source}-wal`,
					`${destination}-wal`,
					constants.COPYFILE_FICLONE,
				);
			} catch (e) {
				// no log to carry over, every page that matters sits in the database file
				if (!isENOENT(e)) {
					throw e;
				}
			}
		} catch (e) {
			// nothing reaches the generation yet, leaving it behind would only give `orphaned` work
			await this.discard(cloned);
			throw e;
		}

		logger.debug(`cloned <${current}> of <${this.root}> into <${target}>`, {
			root: this.root,
			target,
		});

		return cloned;
	}

	/** re-points `current` at `generation`, returning the generation it pointed at before */
	point(
		generation: DatabaseDomainGeneration,
	): DatabaseDomainGeneration | undefined {
		const { target } = peek(generation);
		const previous = this.current;

		/**
		 * temporary symlink that is renamed to become the {@link current} symlink
		 * required because symlinks can only be _replaced_ atomically, but not recreated
		 */
		const staged = join(this.root, `.${current}-${randomUUID()}`);
		symlinkSync(target, staged);

		try {
			// `rename` replaces the link itself rather than following it
			renameSync(staged, join(this.root, current));
		} catch (e) {
			rmSync(staged, { force: true });
			throw e;
		}

		logger.debug(`pointed <${this.root}> at <${target}>`, {
			root: this.root,
			target,
			previous:
				typeof previous === "undefined" ? undefined : peek(previous).target,
		});

		return previous;
	}

	/** removes a generation */
	async discard(generation: DatabaseDomainGeneration): Promise<void> {
		const { target } = peek(generation);

		// `target` rather than `path`: the generation may be the one reached through `current`, and
		// removing the link would leave the directory it names behind
		await rm(join(this.root, target), {
			recursive: true,
			force: true,
		});

		logger.info(`discarded <${target}> of <${this.root}>`, {
			root: this.root,
			target,
		});
	}

	/** generation that were left behind (e.g. when a process dies mid-swap) */
	async orphaned(): Promise<DatabaseDomainGeneration[]> {
		const link = this.current;
		const live = typeof link === "undefined" ? undefined : peek(link).target;

		let entries;
		try {
			entries = await readdir(join(this.root, generation), {
				withFileTypes: true,
			});
		} catch (e) {
			if (!isENOENT(e)) {
				throw e;
			}

			return [];
		}

		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => ({
				id: entry.name,
				target: join(generation, entry.name),
			}))
			.filter(({ target }) => target !== live)
			.map(({ id, target }) => this.seal(id, target));
	}
}
