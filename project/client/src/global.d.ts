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

/** injected during build */
declare const SSR: boolean;
/** injected during build */
declare const API_BASE_URL: string;
type LocationToken = string & { _brand: unique symbol };
/** unique for every location it is referenced at */
declare const $X_SYN_LOCATION_TOKEN: LocationToken;

/** results of resolvees */
declare const RESOLVED:
	| Record<LocationToken, [readonly unknown[], unknown]>
	| undefined;
