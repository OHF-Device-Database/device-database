import {
	parseableCommandDatabaseIngest,
	parseCommandTextDatabaseIngest,
} from "./command/database-ingest";
import {
	parseableCommandDatabaseQuery,
	parseCommandTextDatabaseQuery,
} from "./command/database-query";
import {
	parseableCommandDatabaseScheduler,
	parseCommandTextDatabaseScheduler,
} from "./command/database-scheduler";

import type { ParsedCommandTextError } from "./command/base";
import type {
	ParseableCommandDatabaseIngest,
	ParsedCommandTextCommandDatabaseIngest,
} from "./command/database-ingest";
import type {
	ParseableCommandDatabaseQuery,
	ParsedCommandTextCommandDatabaseQuery,
} from "./command/database-query";
import type {
	ParseableCommandDatabaseScheduler,
	ParsedCommandTextCommandDatabaseScheduler,
} from "./command/database-scheduler";

export type ParseableCommand =
	| ParseableCommandDatabaseIngest
	| ParseableCommandDatabaseScheduler
	| ParseableCommandDatabaseQuery;

type ParsedCommandTextCommand =
	| ParsedCommandTextCommandDatabaseIngest
	| ParsedCommandTextCommandDatabaseScheduler
	| ParsedCommandTextCommandDatabaseQuery;

export function parseCommandText(
	command: ParseableCommandDatabaseIngest,
	text: string,
): ParsedCommandTextCommandDatabaseIngest | ParsedCommandTextError;
export function parseCommandText(
	command: ParseableCommandDatabaseScheduler,
	text: string,
): ParsedCommandTextCommandDatabaseScheduler | ParsedCommandTextError;
export function parseCommandText(
	command: ParseableCommandDatabaseQuery,
	text: string,
): ParsedCommandTextCommandDatabaseQuery | ParsedCommandTextError;
export function parseCommandText(
	command: ParseableCommand,
	text: string,
): ParsedCommandTextCommand | ParsedCommandTextError {
	switch (command) {
		case parseableCommandDatabaseIngest:
			return parseCommandTextDatabaseIngest(text);
		case parseableCommandDatabaseScheduler:
			return parseCommandTextDatabaseScheduler(text);
		case parseableCommandDatabaseQuery:
			return parseCommandTextDatabaseQuery(text);
	}
}
