import { primeRoutes } from "../../dependency";
import { postSnapshot1 } from "./handler";

const primed = primeRoutes(postSnapshot1);
export default primed;
