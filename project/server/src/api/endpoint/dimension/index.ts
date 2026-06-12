import { primeRoutes } from "../../dependency";
import { getDimensions } from "./handler";

const primed = primeRoutes(getDimensions);
export default primed;
