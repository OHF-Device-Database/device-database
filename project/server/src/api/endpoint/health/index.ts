import { primeRoutes } from "../../dependency";
import { getHealth } from "./handler";

const primed = primeRoutes(getHealth);
export default primed;
