import { Inject, Injectable } from "@nestjs/common";
import type { PickDeep } from "type-fest";

import { Ingress, peek } from "../../service/ingress";
import { floor, type Integer } from "../../type/codec/integer";
import { unroll } from "../../utility/iterable";
import { Config } from "../config/config.module";

type Paginated<I> = {
	headers: {
		link: string;
		"content-range": string;
	};
	total: number;
	links: {
		first: URL;
		last: URL;
		next?: URL;
		prev?: URL;
	};
	items: I[];
};

const contentRange = (offset: Integer, size: Integer, count: Integer) =>
	`items ${offset}-${Math.min(offset + size, count)}/${count}`;

@Injectable()
export class ServiceIngress extends Ingress {
	constructor(@Inject(Config) config: PickDeep<Config, "external">) {
		super(config.external);
	}

	paginate(
		{ defaults }: { defaults: { size: Integer } } = {
			defaults: { size: floor(20) },
		},
	): <I>({
		slice,
		count,
	}: {
		slice: ({
			offset,
			limit,
		}: {
			offset: Integer;
			limit: Integer;
		}) => AsyncIterable<I>;
		count: () => Promise<Integer>;
	}) => ({
		path,
		page,
		size,
	}: {
		path: string | URL;
		page: Integer | undefined;
		size: Integer | undefined;
	}) => Promise<Paginated<I>> {
		return ({ slice, count }) =>
			async ({ path, page, size }) => {
				const _page = page ?? floor(0);
				const _size = size ?? defaults.size;

				const offset = floor(_page * _size);

				const counted = floor(await count());

				const relationships = this.relationships(path, _page, _size, counted);
				const peeked = peek(relationships);

				return {
					headers: {
						link: this.header.link(relationships),
						"content-range": contentRange(offset, _size, counted),
					},
					total: counted,
					links: peeked,
					items:
						counted > 0 ? await unroll(slice({ offset, limit: _size })) : [],
				};
			};
	}
}
