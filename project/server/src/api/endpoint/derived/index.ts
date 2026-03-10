import { primeRoutes } from "../../dependency";
import { getDerivedDevices } from "./device/handler";

const primed = primeRoutes(getDerivedDevices);
export default primed;
