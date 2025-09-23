import { createType } from "@lppedd/di-wise-neo";
import type { ParseError } from "effect/ParseResult";

export type EventSubmissionEitherRight = { version: number };
export type EventSubmissionEitherLeftClash = {
	version: number;
	clash: ParseError;
};
export type EventSubmissionEitherLeft = {
	clashes: EventSubmissionEitherLeftClash[];
};
export type EventSubmissionEither =
	| EventSubmissionEitherLeft
	| EventSubmissionEitherRight;

export type EventSubmission = {
	kind: "submission";
	context: {
		id: string;
		contact: string;
	} & EventSubmissionEither;
};

export type Event = EventSubmission;
export type EventKind = Event["kind"];

export type ISignalProvider = {
	send(event: Event): Promise<void>;
	supported(event: Event): boolean;
};

export const ISignalProvider = createType<ISignalProvider>("ISignalProvider");
