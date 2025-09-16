import { primeRoutes } from "../../dependency";
import { postSnapshot } from "./handler";

const primed = primeRoutes(postSnapshot);
export default primed;
