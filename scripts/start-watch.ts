import "./env";
import { startWatch } from "../lib/gmail";

startWatch().catch(console.error);
