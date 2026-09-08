import {
	Controller,
	Get,
	Header,
	Inject,
	NotFoundException,
	Param,
	Redirect,
	StreamableFile,
} from "@nestjs/common";

import { isNone } from "../../../type/maybe";
import { EXPLORER_PATH, ServiceOpenapiExplorer } from "./explorer.service";

@Controller(EXPLORER_PATH)
export class ControllerOpenapiExplorer {
	constructor(
		@Inject(ServiceOpenapiExplorer)
		private readonly service: ServiceOpenapiExplorer,
	) {}

	@Get()
	@Redirect()
	index() {
		return { url: `/${EXPLORER_PATH}/index.html` };
	}

	@Get("schema.json")
	schema() {
		return this.service.schema;
	}

	@Get("swagger-initializer.js")
	@Header("content-type", "text/javascript")
	initializer(): string {
		return this.service.initializer(`/${EXPLORER_PATH}`);
	}

	// declared last, so the routes above are matched before the distribution
	@Get(":asset")
	async asset(@Param("asset") name: string): Promise<StreamableFile> {
		const asset = await this.service.asset(name);
		if (isNone(asset)) {
			throw new NotFoundException();
		}

		return new StreamableFile(asset.stream, {
			type: asset.contentType,
			length: asset.length,
		});
	}
}
