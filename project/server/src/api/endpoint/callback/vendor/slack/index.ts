import { primeRoutes } from "../../../../dependency";
import { postCallbackVendorSlackSlashCommand } from "./slash-command/handler";

const primed = primeRoutes(postCallbackVendorSlackSlashCommand);
export default primed;
