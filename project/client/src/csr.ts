import type {
	BuiltOperation,
	DistributeResponses,
	Io,
	ResponsesShape,
} from "./api/base";

const pathSubstitutionRegex = /({\w+})/g;

export class MissingContentTypeError extends Error {
	constructor(public url: string) {
		super(`encountered missing content type (${url})`);
		Object.setPrototypeOf(this, MissingContentTypeError.prototype);
	}
}

export class UnsupportedContentTypeError extends Error {
	constructor(
		public url: string,
		public contentType: string
	) {
		super(`encountered unsupported content type (${contentType}) (${url})`);
		Object.setPrototypeOf(this, UnsupportedContentTypeError.prototype);
	}
}

export const csrIo: Io = async <T extends ResponsesShape>(
	built: BuiltOperation<T>,
	signal?: AbortSignal
): Promise<DistributeResponses<T>> => {
	const requestHeaders: HeadersInit = new Headers();
	for (const [key, value] of Object.entries(built.parameters.header)) {
		if (typeof value !== "string") {
			continue;
		}

		requestHeaders.set(key, value);
	}

	const path = built.path.replaceAll(pathSubstitutionRegex, (match) => {
		// slice off surrounding brackets
		const variable = match.slice(1, -1);
		return encodeURIComponent(built.parameters.path[variable] ?? "");
	});

	const query =
		Object.keys(built.parameters.query).length > 0
			? `?${new URLSearchParams(built.parameters.query)}`
			: "";

	const body = built.body;

	let serialized: string | null = null;
	if (body) {
		switch (body.contentType) {
			case "application/json":
				serialized = JSON.stringify(body.body);
				break;
			case "text/plain":
				serialized = body.body as string;
				break;
		}

		requestHeaders.set("content-type", body.contentType);
	}

	const url = `${API_BASE_URL}${path}${query}`;

	const fetched = await fetch(url, {
		method: built.method.toUpperCase(),
		headers: requestHeaders,
		body: serialized,
		credentials: "same-origin",
		signal: signal ?? null,
	});

	const contentType = fetched.headers.get("content-type");

	const responseHeaders: Record<string, string> = {};
	for (const [key, value] of fetched.headers) {
		responseHeaders[key] = value;
	}

	// remove encoding instructions
	const strippedContentType = contentType?.split(";")[0];

	switch (strippedContentType) {
		case undefined:
			throw new MissingContentTypeError(url);
		case "application/json":
			return {
				code: fetched.status,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- concrete runtime type not known here
				body: await fetched.json(),
				headers: responseHeaders,
			} as DistributeResponses<T>;
		case "text/plain":
			return {
				code: fetched.status,
				body: await fetched.text(),
				headers: responseHeaders,
			} as DistributeResponses<T>;
		default:
			throw new UnsupportedContentTypeError(url, contentType ?? "");
	}
};
