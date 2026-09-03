import { Inject, Injectable, Optional } from "@nestjs/common";

import { SnapshotDeferIngest } from "../../../service/snapshot/defer/ingest";
import { ServiceIntrospection } from "../../introspection/introspection.service";
import { ServiceSnapshot } from "../snapshot.service";
import { SnapshotDeferTarget } from "./target.interface";

@Injectable()
export class ServiceSnapshotDeferIngest extends SnapshotDeferIngest {
	constructor(
		@Inject(ServiceSnapshot) snapshot: ServiceSnapshot,
		@Optional()
		@Inject(SnapshotDeferTarget)
		target: SnapshotDeferTarget | undefined,
		@Inject(ServiceIntrospection) introspection: ServiceIntrospection,
	) {
		super(snapshot, target, introspection);
	}
}
