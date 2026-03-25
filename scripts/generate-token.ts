import jwt from "jsonwebtoken";
import "./env";

const token = jwt.sign({ scope: "read:mail" }, process.env.JWT_SECRET!, {
  expiresIn: "1y",
});

console.log(token);
