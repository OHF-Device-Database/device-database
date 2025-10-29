extended to allow `origin` and `pathname` to be specified, which is required for ssr
also removes top-level references to `location`, which causes problems during ssr
