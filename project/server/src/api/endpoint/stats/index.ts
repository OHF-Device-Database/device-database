import { primeRoutes } from "../../dependency";
import { getStatsStagingSnapshot } from "./staging/snapshot/handler";

const primed = primeRoutes(getStatsStagingSnapshot);
export default primed;
