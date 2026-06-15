import { createHash } from "node:crypto";
import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";

import { Schema } from "effect";

import { logger as parentLogger } from "../../../logger";
import { isNone, isSome } from "../../../type/maybe";
import {
	POSTFLIGHT_BEGIN,
	POSTFLIGHT_END,
	PREFLIGHT_BEGIN,
	PREFLIGHT_END,
} from "./base";

import type { IDatabase } from "..";
import type { DatabaseName } from "../base";

const logger = parentLogger.child({ label: "database-migrate" });

const DatabaseMigratePlanStrategySymbol = Symbol(
	"DatabaseMigratePlanStrategySymbol",
);
type DatabaseMigratePlanStrategy = {
	[DatabaseMigratePlanStrategySymbol]:
		| ((
				| {
						kind: "initial";
				  }
				| {
						kind: "subsequent";
				  }
		  ) & {
				/** guaranteed to be sorted and free of duplicates */
				pending: DatabaseMigrateMigration[];
		  })
		| { kind: "inert" };
};

type DatabaseMigratePlanUnachievableTableIntegrityViolation = {
	kind: "table-integrity-violation";
	found: unknown;
};
type DatabaseMigratePlanUnachievableUnexpectedMigration = {
	kind: "unexpected-migration";
	expected: DatabaseMigrateMigrationDescriptor;
	received: DatabaseMigrateMigration;
};
type DatabaseMigratePlanUnachievableDuplicateIdentifier = {
	kind: "duplicate-identifier";
	migration: DatabaseMigrateMigrationDescriptor;
};
type DatabaseMigratePlanUnachievableMalformedMigration = {
	kind: "malformed-migration";
	migration: DatabaseMigrateMigration;
};

type DatabaseMigratePlanUnachievable =
	| DatabaseMigratePlanUnachievableTableIntegrityViolation
	| DatabaseMigratePlanUnachievableDuplicateIdentifier
	| DatabaseMigratePlanUnachievableMalformedMigration
	| DatabaseMigratePlanUnachievableUnexpectedMigration;

type DatabaseMigratePlan =
	| DatabaseMigratePlanStrategy
	| DatabaseMigratePlanUnachievable;

export class DatabaseMigrateActError extends Error {
	/* node:coverage disable */
	constructor(
		public migration: DatabaseMigrateMigration,
		public error: unknown,
	) {
		super(`error while deploying migration <${migration.name}>`);
		Object.setPrototypeOf(this, DatabaseMigrateActError.prototype);
	}
	/* node:coverage enable */
}

export interface IDatabaseMigrate {
	plan(migrations: readonly DatabaseMigrateMigration[]): DatabaseMigratePlan;
	act(strategy: DatabaseMigratePlanStrategy): void;
}

export const MIGRATION_TABLE_NAME = "migration";
const MIGRATION_TABLE_DDL = `create table ${MIGRATION_TABLE_NAME} (
  id integer not null,
  name text not null,
  hash text not null,
  created_at integer not null
) strict;`;

const DatabaseMigrateMigrationDescriptor = Schema.Struct({
	id: Schema.BigInt.pipe(Schema.greaterThanOrEqualToBigInt(0n)),
	name: Schema.String,
	hash: Schema.String,
});
type DatabaseMigrateMigrationDescriptor =
	typeof DatabaseMigrateMigrationDescriptor.Type;

const DatabaseMigrateMigration = Schema.Struct({
	...DatabaseMigrateMigrationDescriptor.fields,
	content: Schema.String,
});
export type DatabaseMigrateMigration = typeof DatabaseMigrateMigration.Type;

export type ParsedMigration = {
	preflight: string | null;
	body: string;
	postflight: string | null;
};

export type ParseMigrationError =
	| "duplicate-marker"
	| "nested-marker"
	| "unpaired-marker"
	| "preflight-not-at-start"
	| "postflight-not-at-end";

export type ParseMigrationResult =
	| { kind: "success"; migration: ParsedMigration }
	| { kind: "error"; error: ParseMigrationError; line: number };

const countOccurrences = (haystack: string, needle: string): number => {
	let count = 0;
	let idx = haystack.indexOf(needle);
	while (idx !== -1) {
		count++;
		idx = haystack.indexOf(needle, idx + 1);
	}
	return count;
};

const lineAt = (content: string, charIdx: number): number =>
	content.slice(0, charIdx).split("\n").length;

export const parseMigration = (content: string): ParseMigrationResult => {
	const markers = [
		PREFLIGHT_BEGIN,
		PREFLIGHT_END,
		POSTFLIGHT_BEGIN,
		POSTFLIGHT_END,
	] as const;

	// check for duplicate markers
	for (const marker of markers) {
		if (countOccurrences(content, marker) > 1) {
			let idx = content.indexOf(marker);
			idx = content.indexOf(marker, idx + 1);
			return {
				kind: "error",
				error: "duplicate-marker",
				line: lineAt(content, idx),
			};
		}
	}

	const preflightBeginIdx = content.indexOf(PREFLIGHT_BEGIN);
	const preflightEndIdx = content.indexOf(PREFLIGHT_END);
	const postflightBeginIdx = content.indexOf(POSTFLIGHT_BEGIN);
	const postflightEndIdx = content.indexOf(POSTFLIGHT_END);

	const hasPreflightBegin = preflightBeginIdx !== -1;
	const hasPreflightEnd = preflightEndIdx !== -1;
	const hasPostflightBegin = postflightBeginIdx !== -1;
	const hasPostflightEnd = postflightEndIdx !== -1;

	// check for nested markers
	if (hasPreflightBegin && hasPreflightEnd) {
		const preflightInner = content.slice(
			preflightBeginIdx + PREFLIGHT_BEGIN.length,
			preflightEndIdx,
		);
		const nestedPostBegin = preflightInner.indexOf(POSTFLIGHT_BEGIN);
		if (nestedPostBegin !== -1) {
			return {
				kind: "error",
				error: "nested-marker",
				line: lineAt(
					content,
					preflightBeginIdx + PREFLIGHT_BEGIN.length + nestedPostBegin,
				),
			};
		}
		const nestedPostEnd = preflightInner.indexOf(POSTFLIGHT_END);
		if (nestedPostEnd !== -1) {
			return {
				kind: "error",
				error: "nested-marker",
				line: lineAt(
					content,
					preflightBeginIdx + PREFLIGHT_BEGIN.length + nestedPostEnd,
				),
			};
		}
	}

	if (hasPostflightBegin && hasPostflightEnd) {
		const postflightInner = content.slice(
			postflightBeginIdx + POSTFLIGHT_BEGIN.length,
			postflightEndIdx,
		);
		const nestedPreflightBegin = postflightInner.indexOf(PREFLIGHT_BEGIN);
		if (nestedPreflightBegin !== -1) {
			return {
				kind: "error",
				error: "nested-marker",
				line: lineAt(
					content,
					postflightBeginIdx + POSTFLIGHT_BEGIN.length + nestedPreflightBegin,
				),
			};
		}
		const nestedPreflightEnd = postflightInner.indexOf(PREFLIGHT_END);
		if (nestedPreflightEnd !== -1) {
			return {
				kind: "error",
				error: "nested-marker",
				line: lineAt(
					content,
					postflightBeginIdx + POSTFLIGHT_BEGIN.length + nestedPreflightEnd,
				),
			};
		}
	}

	// check for unpaired markers
	if (hasPreflightBegin && !hasPreflightEnd) {
		return {
			kind: "error",
			error: "unpaired-marker",
			line: lineAt(content, preflightBeginIdx),
		};
	}
	if (!hasPreflightBegin && hasPreflightEnd) {
		return {
			kind: "error",
			error: "unpaired-marker",
			line: lineAt(content, preflightEndIdx),
		};
	}
	if (hasPostflightBegin && !hasPostflightEnd) {
		return {
			kind: "error",
			error: "unpaired-marker",
			line: lineAt(content, postflightBeginIdx),
		};
	}
	if (!hasPostflightBegin && hasPostflightEnd) {
		return {
			kind: "error",
			error: "unpaired-marker",
			line: lineAt(content, postflightEndIdx),
		};
	}

	// check preflight is at start of file
	if (hasPreflightBegin) {
		const before = content.slice(0, preflightBeginIdx).trim();
		if (before.length > 0) {
			return {
				kind: "error",
				error: "preflight-not-at-start",
				line: lineAt(content, preflightBeginIdx),
			};
		}
	}

	// check postflight is at end of file
	if (hasPostflightEnd) {
		const after = content
			.slice(postflightEndIdx + POSTFLIGHT_END.length)
			.trim();
		if (after.length > 0) {
			return {
				kind: "error",
				error: "postflight-not-at-end",
				line: lineAt(content, postflightEndIdx),
			};
		}
	}

	// parse sections
	let preflight: string | null = null;
	let postflight: string | null = null;
	let body = content;

	if (hasPreflightBegin && hasPreflightEnd) {
		preflight = content
			.slice(preflightBeginIdx + PREFLIGHT_BEGIN.length, preflightEndIdx)
			.trim();
		body = content.slice(preflightEndIdx + PREFLIGHT_END.length);
	}

	const bodyPostflightBeginIdx = body.indexOf(POSTFLIGHT_BEGIN);
	const bodyPostflightEndIdx = body.indexOf(POSTFLIGHT_END);

	if (bodyPostflightBeginIdx !== -1 && bodyPostflightEndIdx !== -1) {
		postflight = body
			.slice(
				bodyPostflightBeginIdx + POSTFLIGHT_BEGIN.length,
				bodyPostflightEndIdx,
			)
			.trim();
		body = body.slice(0, bodyPostflightBeginIdx);
	}

	return {
		kind: "success",
		migration: {
			preflight,
			body: body.trim(),
			postflight,
		},
	};
};

export class DatabaseMigrate implements IDatabaseMigrate {
	constructor(private db: IDatabase<DatabaseName | undefined>) {}

	private static fileNameFormat = /^(?<id>\d+).*/;

	public static viable(
		plan: DatabaseMigratePlan,
	): plan is DatabaseMigratePlanStrategy {
		return DatabaseMigratePlanStrategySymbol in plan;
	}

	public static peek(
		strategy: DatabaseMigratePlanStrategy,
	): DatabaseMigratePlanStrategy[typeof DatabaseMigratePlanStrategySymbol] {
		return strategy[DatabaseMigratePlanStrategySymbol];
	}

	public plan(
		migrations: readonly DatabaseMigrateMigration[],
	): DatabaseMigratePlan {
		// does migration table already exist?
		let deployed: boolean;
		{
			const expected = Schema.Tuple(Schema.Tuple(Schema.Number));
			const rows = [
				...this.db.raw.query(
					"select exists(select 1 from sqlite_master where type = 'table' and name = :table)",
					{ returnArray: true },
					{ table: MIGRATION_TABLE_NAME },
				),
			];

			const decoded = Schema.decodeUnknownSync(expected)(rows);
			deployed = Boolean(decoded[0][0]);
		}

		// ensure that there are not duplicate identifiers
		{
			const identifiers: Set<bigint> = new Set();
			for (const migration of migrations) {
				if (identifiers.has(migration.id)) {
					return {
						kind: "duplicate-identifier",
						migration,
					};
				}

				identifiers.add(migration.id);
			}
		}

		// ensure refinements (e.g. `id` > 0) hold
		const guard = Schema.is(DatabaseMigrateMigrationDescriptor);
		for (const migration of migrations) {
			if (!guard(migration)) {
				return {
					kind: "malformed-migration",
					migration,
				};
			}
		}

		const all = [...migrations];

		// `.sort` expects `number`s as result, but only needs to differentiate between smaller / equals / larger
		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#comparisons
		all.sort(({ id: aId }, { id: bId }) =>
			// equal case will never be hit because migrations with duplicate identifiers are removed above
			/* c8 ignore next */
			aId < bId ? -1 : aId > bId ? 1 : 0,
		);

		if (!deployed) {
			return {
				[DatabaseMigratePlanStrategySymbol]: {
					kind: "initial",
					pending: all,
				},
			};
		}

		const descriptors: DatabaseMigrateMigrationDescriptor[] = [];
		{
			const guard = Schema.is(DatabaseMigrateMigrationDescriptor);
			for (const row of this.db.raw.query(
				`select id, name, hash from ${MIGRATION_TABLE_NAME} order by id`,
				{ returnArray: false, returnBigInt: true },
				{},
			)) {
				if (!guard(row)) {
					return {
						kind: "table-integrity-violation",
						found: row,
					};
				}

				descriptors.push(row);
			}
		}

		for (let i = 0; i < all.length; i++) {
			const migration = all[i];
			const descriptor = descriptors.at(i);

			// more pending migrations than deployed migrations
			if (typeof descriptor === "undefined") {
				return {
					[DatabaseMigratePlanStrategySymbol]: {
						kind: "subsequent",
						pending: all.slice(i),
					},
				};
			}

			if (
				descriptor.id !== migration.id ||
				descriptor.name !== migration.name ||
				descriptor.hash !== migration.hash
			) {
				return {
					kind: "unexpected-migration",
					expected: descriptor,
					received: migration,
				};
			}
		}

		return {
			[DatabaseMigratePlanStrategySymbol]: {
				kind: "inert",
			},
		};
	}

	public act(strategy: DatabaseMigratePlanStrategy) {
		const peeked = strategy[DatabaseMigratePlanStrategySymbol];

		if (peeked.kind === "inert") {
			return;
		}

		if (peeked.kind === "initial") {
			this.db.raw.exec(MIGRATION_TABLE_DDL);
		}

		const now = Math.floor(Date.now() / 1000);

		for (const migration of peeked.pending) {
			const result = parseMigration(migration.content);

			if (result.kind === "error") {
				throw new DatabaseMigrateActError(migration, result);
			}

			const { preflight, body, postflight } = result.migration;

			if (isSome(preflight)) {
				try {
					this.db.raw.exec(preflight);
				} catch (e) {
					throw new DatabaseMigrateActError(migration, e);
				}
			}

			this.db.raw.exec("begin;");

			try {
				this.db.raw.exec(body);
			} catch (e) {
				this.db.raw.exec("rollback;");
				throw new DatabaseMigrateActError(migration, e);
			}

			for (const _ of this.db.raw.query(
				`insert into ${MIGRATION_TABLE_NAME} (
				  id, name, hash, created_at
				) values (
				  :id, :name, :hash, :createdAt
				)`,
				{ returnArray: false },
				{
					id: migration.id,
					name: migration.name,
					hash: migration.hash,
					createdAt: now,
				},
			)) {
			}

			this.db.raw.exec("commit;");

			if (isSome(postflight)) {
				try {
					this.db.raw.exec(postflight);
				} catch (e) {
					throw new DatabaseMigrateActError(migration, e);
				}
			}
		}
	}

	static async *migrations(
		directory: string,
	): AsyncIterable<DatabaseMigrateMigration> {
		for await (const entry of glob("*.sql", {
			cwd: directory,
			withFileTypes: true,
		})) {
			if (!(entry.isFile() || entry.isSymbolicLink())) {
				continue;
			}

			const match = entry.name.match(DatabaseMigrate.fileNameFormat);
			if (isNone(match)) {
				logger.warn(
					`encountered file with unexpected name <${entry.name}> in database migration directory, skipping`,
					{ name: entry.name },
				);
				continue;
			}

			// biome-ignore lint/style/noNonNullAssertion: not optional as long as named group exists
			const id = BigInt(match.groups!.id!);
			const content = await readFile(join(entry.parentPath, entry.name));

			const hasher = createHash("sha256");
			hasher.update(content);

			yield {
				id,
				name: entry.name,
				hash: hasher.digest("hex"),
				content: content.toString("utf-8"),
			};
		}
	}
}
