import { floor, type Integer } from "../type/codec/integer";
import { unroll } from "../utility/iterable";

import type { Dependency } from "./dependency";

type Paginated<I> = {
	headers: {
		link: string;
		"content-range": string;
	};
	items: I[];
};

const contentRange = (offset: Integer, size: Integer, count: Integer) =>
	`items ${offset}-${Math.min(offset + size, count)}/${count}`;

export const paginate =
	(
		d: Pick<Dependency, "ingress">,
		{ defaults }: { defaults: { size: Integer } } = {
			defaults: { size: floor(20) },
		},
	): (<I>({
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
		path: string;
		page: Integer | undefined;
		size: Integer | undefined;
	}) => Promise<Paginated<I>>) =>
	({ slice, count }) =>
	async ({ path, page, size }) => {
		const _page = page ?? floor(0);
		const _size = size ?? defaults.size;

		const offset = floor(_page * _size);

		const counted = floor(await count());

		return {
			headers: {
				link: d.ingress.header.link(path, _page, _size, counted),
				"content-range": contentRange(offset, _size, counted),
			},
			items: counted > 0 ? await unroll(slice({ offset, limit: _size })) : [],
		};
	};
