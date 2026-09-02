import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
	Inject,
	Injectable,
	Logger,
	ServiceUnavailableException,
	UnauthorizedException,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { PickDeep } from "type-fest";

import { isNone, isSome, type Maybe } from "../../type/maybe";
import { Config } from "../config/config.module";

type AuthorizedRequest = {
	headers: { authorization?: string };
};

/** denies metrics scraping unless the configured bearer token is presented */
@Injectable()
export class GuardIntrospection implements CanActivate {
	private readonly logger = new Logger(GuardIntrospection.name);

	private readonly configuration: {
		bearerToken: Maybe<string>;
		secure: boolean;
	};

	constructor(
		@Inject(Config) config: PickDeep<
			Config,
			"introspection.bearerToken" | "secure"
		>,
		@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
	) {
		this.configuration = {
			bearerToken: config.introspection.bearerToken,
			secure: config.secure,
		};

		if (this.configuration.secure && isNone(this.configuration.bearerToken)) {
			this.logger.warn(
				"running securely with no provided introspection bearer token, metrics inaccessible",
			);
		}
	}

	canActivate(context: ExecutionContext): boolean {
		if (isSome(this.configuration.bearerToken)) {
			const http = context.switchToHttp();
			const { authorization } = http.getRequest<AuthorizedRequest>().headers;

			// secure / insecure with configured token and valid authorization
			if (authorization === `Bearer ${this.configuration.bearerToken}`) {
				return true;
			}

			// https://community.grafana.com/t/grafana-cloud-metrics-endpoint-error-for-wordpress-plugin/124359/6
			this.adapterHost.httpAdapter.setHeader(
				http.getResponse(),
				"WWW-Authenticate",
				"Bearer",
			);

			// secure / insecure with configured token and invalid authorization
			throw new UnauthorizedException();
		}

		// insecure without configured token
		if (!this.configuration.secure) {
			return true;
		}

		// secure without configured token
		throw new ServiceUnavailableException();
	}
}
