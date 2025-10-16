declare module "*.png" {
	const value: string;
	export = value;
}

declare module "sized:*.png" {
	const value: {
		src: string;
		width: number;
		height: number;
	};
	export = value;
}

declare module "*.svg" {
	const value: string;
	export = value;
}

/* injected during build */
declare const SSR: boolean;
declare const API_BASE_URL: string;
