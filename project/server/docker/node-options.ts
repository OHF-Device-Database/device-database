import { env, stdout } from "node:process";

void (async () => {
	// source memory limit from ECS task definition
	maxOldSpaceSize: {
		const uriVariable = "ECS_CONTAINER_METADATA_URI_V4";

		if (!Object.hasOwn(env, uriVariable)) {
			break maxOldSpaceSize;
		}

		const response = await fetch(`${env[uriVariable]}/task`);
		if (!response.ok) {
			break maxOldSpaceSize;
		}

		const data = await response.json();

		const memoryLimit = data.Limits.Memory;
		const maxOldSpaceSize = Math.floor(memoryLimit / 0.75);

		stdout.write(`--max-old-space-size=${maxOldSpaceSize}`);
	}
})();
