import { primeRoutes } from "../../dependency";
import { getDerivedDevice, getDerivedDevices } from "./device/handler";

const primed = primeRoutes(getDerivedDevices, getDerivedDevice);
export default primed;
