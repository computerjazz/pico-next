import jwt from "jsonwebtoken";
import "./env";

const mailToken = jwt.sign({ scope: "read:mail" }, process.env.JWT_SECRET!);
const toggleToken = jwt.sign(
  { scope: "read:toggle,write:toggle" },
  process.env.JWT_SECRET!,
);
const wsToken = jwt.sign({ scope: "websocket" }, process.env.JWT_SECRET!);
const serverToken = jwt.sign({ scope: "server" }, process.env.JWT_SECRET!);
console.log("mail", mailToken);
console.log("toggle", toggleToken);
console.log("ws", wsToken);
console.log("server", serverToken);
