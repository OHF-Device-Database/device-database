import { type DatabaseName, isDatabaseName } from "../../../../database/base";
import { insertDerivedDevices } from "../../../../database/query/derived/device-insert";
import {
	alias,
	literal,
	pattern,
} from "../../../../scheduler/scheduled/derive/device/rules";
import { blockMrkdwn, blocksCode } from "../block";
import { ephemeral, reason, words } from "./base";

import type {
	BoundQuery,
	ConnectionMode,
	ResultMode,
} from "../../../../database/query";
import type { CallbackVendorSlackBase } from "../base";
import type {
	Constructor,
	Handled,
	ParsedCommandTextError,
	ParsedCommandTextParsed,
} from "./base";

export const parseableCommandDatabaseQuery = "/database-query" as const;
export type ParseableCommandDatabaseQuery =
	typeof parseableCommandDatabaseQuery;

export type ParsedCommandTextCommandDatabaseQuery = ParsedCommandTextParsed<{
	action: "plan";
	query: BoundQuery<DatabaseName, ResultMode, ConnectionMode, unknown>;
}>;

const allowedQueries: Record<
	DatabaseName,
	BoundQuery<DatabaseName, ResultMode, ConnectionMode, unknown>[]
> = {
	derived: [
		insertDerivedDevices.bind.named({
			ruleLiteralIntegration: JSON.stringify(literal.integration),
			ruleLiteralManufacturer: JSON.stringify(literal.manufacturer),
			ruleLiteralModel: JSON.stringify(literal.model),
			rulePatternManufacturer: JSON.stringify(pattern.manufacturer),
			rulePatternModel: JSON.stringify(pattern.model),
			ruleAliasManufacturer: JSON.stringify(alias.manufacturer),
		}),
	],
	staging: [],
};

export const parseCommandTextDatabaseQuery = (
	text: string,
): ParsedCommandTextCommandDatabaseQuery | ParsedCommandTextError => {
	const [database, action, query] = words(text);
	if (typeof database === "undefined") {
		return {
			kind: "error",
			blocks: [
				blockMrkdwn(
					`missing database (known: ${Object.keys(allowedQueries)
						.map((database) => `\`${database}\``)
						.join(", ")})`,
				),
			],
		};
	}

	if (!isDatabaseName(database)) {
		return {
			kind: "error",
			blocks: [
				blockMrkdwn(
					`unknown database (known: ${Object.keys(allowedQueries)
						.map((database) => `\`${database}\``)
						.join(", ")})`,
				),
			],
		};
	}

	switch (action) {
		case "plan": {
			const candidates = allowedQueries[database];
			if (typeof query === "undefined") {
				if (candidates.length === 0) {
					return {
						kind: "error",
						blocks: [blockMrkdwn(`missing query name (no known queries)`)],
					};
				}
				return {
					kind: "error",
					blocks: [
						blockMrkdwn(
							`missing query name (known: ${candidates.map(({ name }) => `\`${name}\``).join(", ")})`,
						),
					],
				};
			}

			const candidate = candidates
				.filter(
					({ name }) => name.toLowerCase() === query?.trim()?.toLowerCase(),
				)
				.at(0);

			if (typeof candidate === "undefined") {
				if (candidates.length === 0) {
					return {
						kind: "error",
						blocks: [
							blockMrkdwn(`unknown or unsupported query (no known queries)`),
						],
					};
				}
				return {
					kind: "error",
					blocks: [
						blockMrkdwn(
							`unknown or unsupported query (known: ${candidates.map(({ name }) => `\`${name}\``).join(", ")})`,
						),
					],
				};
			}

			return {
				kind: "parsed",
				inner: { action: "plan", query: candidate },
			};
		}
		default:
			return {
				kind: "error",
				blocks: [blockMrkdwn(`unknown action (known: plan)`)],
			};
	}
};

export const mixinCommandDatabaseQuery = <
	T extends Constructor<CallbackVendorSlackBase>,
>(
	Base: T,
) =>
	class extends Base {
		protected handleCommandDatabaseQuery(
			parsed: ParsedCommandTextCommandDatabaseQuery,
		): Handled {
			const database = this.databases?.[parsed.inner.query.database];
			if (typeof database === "undefined") {
				return ephemeral(
					blockMrkdwn(
						`database \`${parsed.inner.query.database}\` not available 😔`,
					),
				);
			}

			switch (parsed.inner.action) {
				case "plan": {
					let plan: string;
					try {
						plan = database.explain(parsed.inner.query);
					} catch (error) {
						return ephemeral(
							blockMrkdwn(
								`could not plan *\`${parsed.inner.query.name}\`*, ${reason(error)} 😰`,
							),
						);
					}

					return ephemeral(
						blockMrkdwn(
							`query plan for *\`${parsed.inner.query.name}\`* on *\`${parsed.inner.query.database}\`* 🔍`,
						),
						...blocksCode(plan),
					);
				}
			}
		}
	};
