import { clearLine, cursorTo } from "node:readline";
import { Recoverable, start } from "node:repl";
import { inspect, parseArgs } from "node:util";

// `node inspect` evaluates without `replMode` → no top-level await, promises print as `Promise`

const {
	values: { address = "127.0.0.1:9229" },
} = parseArgs({ options: { address: { type: "string" } } });

type RemoteObject = {
	type: string;
	className?: string;
	value?: unknown;
	unserializableValue?: string;
	description?: string;
	objectId?: string;
};

type Evaluated = {
	result: RemoteObject;
	exceptionDetails?: { text: string; exception?: RemoteObject };
};

type ConsoleAPICalled = {
	type: string;
	args: RemoteObject[];
	executionContextId: number;
};

const targets = (await (await fetch(`http://${address}/json/list`)).json()) as {
	webSocketDebuggerUrl: string;
}[];
if (targets.length === 0) {
	console.error(`no inspector targets at <${address}>`);
	process.exit(1);
}

const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
	socket.addEventListener("open", resolve, { once: true });
	socket.addEventListener("error", reject, { once: true });
});

const pending = new Map<
	number,
	(message: { result?: unknown; error?: { message: string } }) => void
>();

const forwarded: Record<string, NodeJS.WriteStream> = {
	log: process.stdout,
	debug: process.stdout,
	info: process.stdout,
	dir: process.stdout,
	warning: process.stderr,
	error: process.stderr,
};

// messages prior to `Runtime.enable` responding are replayed history
let live = false;
let evaluating = false;
// keeps output in order, evaluation results wait on it
let printing = Promise.resolve();

socket.addEventListener("message", ({ data }) => {
	const message = JSON.parse(String(data));

	if (message.method === "Runtime.consoleAPICalled") {
		const { type, args, executionContextId }: ConsoleAPICalled = message.params;
		const stream = forwarded[type];
		if (!live || typeof stream === "undefined") {
			return;
		}

		printing = printing
			.then(async () => {
				const {
					result: { value: text },
				} = await send<{ result: { value: string } }>(
					"Runtime.callFunctionOn",
					{
						executionContextId,
						functionDeclaration: `function (colors, dir, ...args) {
						const util = process.getBuiltinModule("node:util");
						return dir
							? util.inspect(args[0], { customInspect: false, ...args[1], colors })
							: util.formatWithOptions({ colors }, ...args);
					}`,
						arguments: [
							{ value: colors },
							{ value: type === "dir" },
							...args.map(({ objectId, unserializableValue, value }) =>
								typeof objectId !== "undefined"
									? { objectId }
									: typeof unserializableValue !== "undefined"
										? { unserializableValue }
										: { value },
							),
						],
						returnByValue: true,
					},
				);

				for (const { objectId } of args) {
					if (typeof objectId !== "undefined") {
						void send("Runtime.releaseObject", { objectId }).catch(() => {});
					}
				}

				// while idle, printed above the prompt instead of into it
				const redraw = !evaluating && process.stdout.isTTY;
				if (redraw) {
					clearLine(process.stdout, 0);
					cursorTo(process.stdout, 0);
				}
				stream.write(`${text}\n`);
				if (redraw) {
					server.displayPrompt(true);
				}
			})
			.catch(() => {});
		return;
	}

	pending.get(message.id)?.(message);
	pending.delete(message.id);
});

const disconnected = () => {
	console.error("\ninspector disconnected");
	process.exit(1);
};
socket.addEventListener("close", disconnected);

let sequence = 0;
const send = <T>(method: string, params: object) =>
	new Promise<T>((resolve, reject) => {
		const id = ++sequence;
		pending.set(id, ({ result, error }) =>
			typeof error !== "undefined"
				? reject(new Error(error.message))
				: resolve(result as T),
		);
		socket.send(JSON.stringify({ id, method, params }));
	});

const objectGroup = "inspect";
const colors = process.stdout.hasColors?.() ?? false;

const server = start({
	prompt: "inspect> ",
	eval: (code, _context, _file, callback) => {
		evaluating = true;
		(async () => {
			try {
				const { result, exceptionDetails } = await send<Evaluated>(
					"Runtime.evaluate",
					{ expression: code, replMode: true, awaitPromise: true, objectGroup },
				);
				const subject = exceptionDetails?.exception ?? result;

				if (
					subject.className === "SyntaxError" &&
					subject.description?.includes("Unexpected end of input")
				) {
					return new Recoverable(new SyntaxError(subject.description));
				}

				// formatted remotely, so output matches the server's own `util.inspect`
				const formatted =
					typeof subject.objectId !== "undefined"
						? (
								await send<{ result: { value: string } }>(
									"Runtime.callFunctionOn",
									{
										objectId: subject.objectId,
										functionDeclaration: `function (colors) { return process.getBuiltinModule("node:util").inspect(this, { colors }); }`,
										arguments: [{ value: colors }],
										returnByValue: true,
									},
								)
							).result.value
						: (subject.unserializableValue ??
							inspect(subject.value, { colors }));

				return typeof exceptionDetails !== "undefined"
					? `Uncaught ${formatted}`
					: formatted;
			} finally {
				// before the callback, so it can't race the next evaluation
				await send("Runtime.releaseObjectGroup", { objectGroup }).catch(
					() => {},
				);
				// console output caused by the evaluation precedes its result
				await printing;
				evaluating = false;
			}
		})().then(
			(output) =>
				output instanceof Recoverable
					? callback(output, undefined)
					: callback(null, output),
			(error) => callback(error, undefined),
		);
	},
	writer: (output) => String(output),
});
server.setupHistory(".inspect_history", () => {});

server.on("exit", () => {
	socket.removeEventListener("close", disconnected);
	socket.close();
});

await send("Runtime.enable", {});
live = true;
