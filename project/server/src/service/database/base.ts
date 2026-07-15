import { statSync } from "node:fs";
import { constants } from "node:os";
import { resolve } from "node:path";
import { cwd } from "node:process";

export const databaseNames = ["derived", "staging"] as const;
export type DatabaseName = (typeof databaseNames)[number];

export const databaseAttached = {
	derived: ["staging"],
	staging: [],
} as const satisfies Record<DatabaseName, readonly DatabaseName[]>;
export type DatabaseAttached = typeof databaseAttached;

export type DatabaseDescriptor = {
	location: string | URL;
	readOnly?: boolean;
};

const DatabaseDescriptorBakedSymbol = Symbol("DatabaseDescriptorBakedSymbol");

export type DatabaseDescriptorBaked = {
	[DatabaseDescriptorBakedSymbol]: string;
};

export const bake = (descriptor: DatabaseDescriptor) => {
	if (descriptor.location instanceof URL) {
		const clone = new URL(descriptor.location.toString());
		if (descriptor.readOnly) {
			clone.searchParams.set("mode", "ro");
		}

		// `URL` constructor always prefixes path with slash, even when not provided
		// if pathname corresponds to a file nested in the working directory after removing leading said slash, supplant
		// absolute path to that file
		// this allows supplying e.g. `file:./staging.db` or `file:staging.db`
		const path = clone.pathname.slice(1);
		const resolved = resolve(cwd(), path);

		let found;
		try {
			const stat = statSync(resolved);
			found = stat.isFile() || stat.isSymbolicLink();
		} catch (e) {
			if (
				!(
					typeof e === "object" &&
					e !== null &&
					"errno" in e &&
					e.errno === -constants.errno.ENOENT
				)
			) {
				throw e;
			}

			found = false;
		}

		if (found) {
			clone.pathname = resolved;
		}

		return {
			[DatabaseDescriptorBakedSymbol]: clone.toString(),
		};
	}

	return {
		[DatabaseDescriptorBakedSymbol]: `file:${resolve(descriptor.location)}${descriptor.readOnly ? "?mode=ro" : ""}`,
	};
};

export const peek = (baked: DatabaseDescriptorBaked) =>
	baked[DatabaseDescriptorBakedSymbol];
