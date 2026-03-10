import type { TransformCallback } from "node:stream";
import { Transform } from "node:stream";

export class ArrayTransform extends Transform {
	private buf: unknown | undefined;

	constructor() {
		super({ writableObjectMode: true });
	}

	_construct(callback: (error?: Error | null) => void): void {
		this.push("[");
		callback();
	}

	_transform(
		chunk: unknown,
		_: BufferEncoding,
		callback: TransformCallback,
	): void {
		if (typeof this.buf === "undefined") {
			this.buf = chunk;
		} else {
			this.push(JSON.stringify(this.buf));
			this.push(",");
			this.buf = chunk;
		}

		callback();
	}

	_flush(callback: TransformCallback): void {
		if (typeof this.buf !== "undefined") {
			this.push(JSON.stringify(this.buf));
		}

		this.push("]");

		callback();
	}
}
