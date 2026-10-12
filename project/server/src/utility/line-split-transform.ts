import type { TransformCallback } from "node:stream";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";

/** splits a byte stream into lines, pushing each one as a string
 *
 * can safely be dropped mid-stream, as opposed to {@link import("node:readline").createInterface} */
export class LineSplitTransform extends Transform {
	private readonly decoder = new StringDecoder("utf8");
	private buffered = "";

	constructor() {
		super({ readableObjectMode: true, writableObjectMode: false });
	}

	override _transform(
		chunk: Buffer,
		_: BufferEncoding,
		callback: TransformCallback,
	): void {
		this.buffered += this.decoder.write(chunk);

		let index = this.buffered.indexOf("\n");
		while (index !== -1) {
			const line = this.buffered.slice(0, index);
			this.buffered = this.buffered.slice(index + 1);

			this.push(line.endsWith("\r") ? line.slice(0, -1) : line);

			index = this.buffered.indexOf("\n");
		}

		callback();
	}

	/** a trailing fragment without a terminator is still a line */
	override _flush(callback: TransformCallback): void {
		this.buffered += this.decoder.end();
		if (this.buffered.length > 0) {
			this.push(this.buffered);
			this.buffered = "";
		}

		callback();
	}
}
