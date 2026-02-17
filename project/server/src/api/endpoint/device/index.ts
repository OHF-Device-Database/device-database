import { primeRoutes } from "../../dependency";
import { getDevice } from "./handler";

const primed = primeRoutes(getDevice);
export default primed;
