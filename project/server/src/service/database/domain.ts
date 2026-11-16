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

export class DatabaseDomainGenerationDiscardedError extends Error {
	constructor(public location: string) {
		super(`<${location}> no longer holds a database`);
		Object.setPrototypeOf(
			this,
			DatabaseDomainGenerationDiscardedError.prototype,
		);
	}
}

/** no such file or directory */
const isENOENT = (e: unknown) =>
	typeof e === "object" && e !== null && "errno" in e && e.errno === -ENOENT;

const DatabaseDomainGenerationSealedSymbol = Symbol(
	"DatabaseDomainGenerationSealedSymbol",
);

const DatabaseDomainGenerationOrphanedSealedSymbol = Symbol(
	"DatabaseDomainGenerationOrphanedSealedSymbol",
);

export type DatabaseDomainGenerationInner = Readonly<{
	/** name of the generation within the domain */
	id: string;
	/** path of the generation directory, relative to the domain root */
	target: string;
	/** absolute path of the generation directory */
	path: string;
	/** absolute path of the database within {@link path} */
	location: string;
	/**
	 * {@link location} with every link resolved, which is the file a connection opened against the
	 * generation ends up holding on to
	 */
	resolved: string;
	/** holds absolute path */
	descriptor: DatabaseDescriptorBaked;
}>;

/** generation directory within a {@link DatabaseDomain} */
export type DatabaseDomainGeneration = Readonly<{
	[DatabaseDomainGenerationSealedSymbol]: DatabaseDomainGenerationInner;
}>;

export const peek = (
	generation: DatabaseDomainGeneration,
): DatabaseDomainGenerationInner =>
	generation[DatabaseDomainGenerationSealedSymbol];

export type DatabaseDomainGenerationOrphanedInner = Readonly<{
	/** path of the generation directory, relative to the domain root */
	target: string;
	/** absolute path of the generation directory */
	path: string;
}>;

/** generation directory that nothing reaches anymore */
export type DatabaseDomainGenerationOrphaned = Readonly<{
	[DatabaseDomainGenerationOrphanedSealedSymbol]: DatabaseDomainGenerationOrphanedInner;
}>;

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
	/**
	 * brings layout into state where `current` is symlink to a generation holding a database
	 *
	 * when `current` is absent, `initial` and the database inside are created first when not already present
	 *
	 * links within a generation are followed to ease migration to domains
	 */
	constructor(
		public readonly root: string,
		/** controls what a connection may do, layout itself is still laid out and swapped */
		public readonly readOnly: boolean = false,
	) {
		mkdirSync(this.root, { recursive: true });
		mkdirSync(join(this.root, generation), { recursive: true });

		const link = join(this.root, current);

		// `lstat` rather than `stat`: dangling `current` must not read as absent
		const stat = lstatSync(link, { throwIfNoEntry: false });
		if (typeof stat !== "undefined") {
			if (!stat.isSymbolicLink()) {
				throw new DatabaseDomainCurrentNotLinkError(link);
			}

			return;
		}

		const path = join(this.root, initial);

		// may well exist already, holding a database that predates the layout
		mkdirSync(path, { recursive: true });

		// creates database file
		// also performed for read-only domain as sqlite does not create database file in read-only mode
		new DatabaseSync(
			new URL(peekDescriptor(bake({ location: join(path, file) }))),
		).close();

		this.relink(initial);

		logger.debug(`seeded <${this.root}> with <${initial}>`, {
			root: this.root,
			generation: initial,
		});
	}

	/** mints a handle on the generation `target` names, always through its own directory */
	private seal(id: string, target: string): DatabaseDomainGeneration {
		const path = join(this.root, target);
		const location = join(path, file);

		let resolved: string;
		try {
			resolved = realpathSync(location);
		} catch (e) {
			if (!isENOENT(e)) {
				throw e;
			}

			throw new DatabaseDomainGenerationDiscardedError(location);
		}

		return {
			[DatabaseDomainGenerationSealedSymbol]: {
				id,
				target,
				path,
				location,
				resolved,
				descriptor: bake({ location, readOnly: this.readOnly }),
			},
		};
	}

	/**
	 * descriptor every connection is opened through
	 *
	 * not dereferenced and always reaches the database through {@link current}
	 */
	get descriptor(): DatabaseDescriptorBaked {
		return bake({
			location: join(this.root, current, file),
			readOnly: this.readOnly,
		});
	}

	/** generation {@link current} points at, the constructor laid the layout out */
	get current(): DatabaseDomainGeneration {
		// `readlink` rather than `realpath`, a generation is named relative to the root
		const target = readlinkSync(join(this.root, current));

		return this.seal(basename(target), target);
	}

	/**
	 * creates a generation holding a copy of the database reached through {@link current}
	 *
	 * copy is taken at file system level, using reflink when available
	 *
	 * wal is copied alongside the database
	 *
	 * **database must not be written to for the duration**
	 */
	async clone(id: string = randomUUID()): Promise<DatabaseDomainGeneration> {
		const target = join(generation, id);
		const path = join(this.root, target);
		const destination = join(path, file);

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
				// no log to carry over
				if (!isENOENT(e)) {
					throw e;
				}
			}
		} catch (e) {
			// nothing reaches the generation yet, delete
			await rm(path, { recursive: true, force: true });
			throw e;
		}

		logger.debug(`cloned <${current}> of <${this.root}> into <${target}>`, {
			root: this.root,
			target,
		});

		// sealed once the database is in place, so the handle resolves to it
		return this.seal(id, target);
	}

	/**
	 * re-points `current` at `target`
	 *
	 * also used to lay the link down in the first place, where there is nothing to report on
	 */
	private relink(target: string): void {
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
	}

	/** re-points `current` at `generation`, returning the generation it pointed at before */
	point(generation: DatabaseDomainGeneration): DatabaseDomainGeneration {
		const { target } = peek(generation);
		const previous = this.current;

		this.relink(target);

		logger.debug(`pointed <${this.root}> at <${target}>`, {
			root: this.root,
			target,
			previous: peek(previous).target,
		});

		return previous;
	}

	/** removes a generation, which carries its own path and needs no domain to reach */
	static async discard(
		generation: DatabaseDomainGeneration | DatabaseDomainGenerationOrphaned,
	): Promise<void> {
		const { target, path } =
			DatabaseDomainGenerationSealedSymbol in generation
				? peek(generation)
				: generation[DatabaseDomainGenerationOrphanedSealedSymbol];

		await rm(path, {
			recursive: true,
			force: true,
		});

		logger.info(`discarded <${path}>`, { target, path });
	}

	/** generation that were left behind (e.g. when a process dies mid-swap) */
	async orphaned(): Promise<DatabaseDomainGenerationOrphaned[]> {
		const live = peek(this.current).target;

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
			.map((entry) => join(generation, entry.name))
			.filter((target) => target !== live)
			.map((target) => ({
				[DatabaseDomainGenerationOrphanedSealedSymbol]: {
					target,
					path: join(this.root, target),
				},
			}));
	}
}
