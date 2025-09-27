import { createType } from "@lppedd/di-wise-neo";

export type EventSubmission = {
	kind: "submission";
	context: {
		id: string;
		contact: string;
		version?: number | undefined;
	};
};

export type Event = EventSubmission;
export type EventKind = Event["kind"];

export type ISignalProvider = {
	send(event: Event): Promise<void>;
	supported(event: Event): boolean;
};

export const ISignalProvider = createType<ISignalProvider>("ISignalProvider");
