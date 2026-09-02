declare const HttpResponseTag: unique symbol;

/**
 * opaque handle to the underlying platform's response object
 *
 * actual shape depends on the installed http adapter
 */
export interface HttpResponse {
	readonly [HttpResponseTag]: unknown;
}
