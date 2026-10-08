export type BlockText = {
	type: "mrkdwn";
	text: string;
};
export type BlockField = {
	type: "mrkdwn";
	text: string;
};

export type Block = {
	type: "section";
} & (
	| {
			text: BlockText;
			fields: BlockField[];
	  }
	| {
			text: BlockText;
	  }
	| {
			fields: BlockField[];
	  }
);

export const blockMrkdwn = (text: string): Block => ({
	type: "section",
	text: {
		type: "mrkdwn",
		text,
	},
});

export const blockFields = (fields: BlockField[]): Block => ({
	type: "section",
	// slack renders at most ten fields per block
	// https://docs.slack.dev/reference/block-kit/blocks/section-block
	fields: fields.slice(0, 10),
});

// a section block holds at most 3000 characters, leave room for the surrounding code fence
// https://docs.slack.dev/reference/block-kit/blocks/section-block/#fields
const blockTextLimit = 2900;
// a message holds at most 50 blocks
// https://docs.slack.dev/block-kit/
const blockLimit = 50;

/** renders `text` as however many code blocks it takes to stay within slack limits */
export const blocksCode = (text: string): Block[] => {
	const blocks: Block[] = [];

	let buf = "";
	const flush = () => {
		if (buf.length === 0) {
			return;
		}

		blocks.push(blockMrkdwn(`\`\`\`\n${buf}\`\`\``));
		buf = "";
	};

	let truncated = false;
	for (const line of text.split("\n")) {
		// a single line exceeding the budget can't be rendered in full either way
		const chunk = `${line.slice(0, blockTextLimit)}\n`;

		if (buf.length + chunk.length > blockTextLimit) {
			if (blocks.length === blockLimit) {
				truncated = true;
				break;
			}

			flush();
		}

		buf += chunk;
	}

	if (truncated) {
		blocks.push(blockMrkdwn("_truncated_ ✂️"));
	} else {
		flush();
	}

	return blocks;
};
