import { primeRoutes } from "../../dependency";
import {
	getDerivedDevice,
	getDerivedDeviceDuplicates,
	getDerivedDevices,
} from "./device/handler";

const primed = primeRoutes(
	getDerivedDevices,
	getDerivedDeviceDuplicates,
	getDerivedDevice,
);
export default primed;
