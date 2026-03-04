export const databaseNames = ["derived", "staging"] as const;
export type DatabaseName = (typeof databaseNames)[number];

export const databaseAttached = {
	derived: ["staging"],
	staging: [],
} as const satisfies Record<DatabaseName, readonly DatabaseName[]>;
export type DatabaseAttached = typeof databaseAttached;

export type DatabaseAttachmentDescriptor = {
	path: string;
	readOnly: true;
};

export const attachmentPath = (descriptor: DatabaseAttachmentDescriptor) =>
	`file:${descriptor.path.replaceAll("'", "''")}?mode=${descriptor.readOnly ? "ro" : "rw"}`;
