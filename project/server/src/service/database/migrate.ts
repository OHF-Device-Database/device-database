import { createHash } from "node:crypto";
import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";

import { inject } from "@lppedd/di-wise-neo";
import { Schema } from "effect";

import { logger as parentLogger } from "../../logger";
import { isNone } from "../../type/maybe";
import { IDatabase } from ".";

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

export class DatabaseMigrate implements IDatabaseMigrate {
	constructor(private db: IDatabase = inject(IDatabase)) {}

	private static fileNameFormat = /^(?<id>\d+).*/;

	public static viable(
		strategy: DatabaseMigratePlan,
	): strategy is DatabaseMigratePlanStrategy {
		return DatabaseMigratePlanStrategySymbol in strategy;
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
				`select id, name, hash from ${MIGRATION_TABLE_NAME}`,
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
			this.db.raw.exec("begin;");

			try {
				this.db.raw.exec(migration.content);
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
			const id = BigInt(match.groups?.id!);
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
