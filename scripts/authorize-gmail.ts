import fs from "fs";
import readline from "readline";
import { google } from "googleapis";
import "./env";

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);

const { client_id, client_secret, redirect_uris } = credentials.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0],
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline", // required for refresh token
  prompt: "consent", // forces re-consent, guarantees refresh token
  scope: ["https://www.googleapis.com/auth/gmail.readonly"],
});

console.log("\nAuthorize this app by visiting:\n");
console.log(authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("\nPaste the code here: ", async (code) => {
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  fs.writeFileSync("token.json", JSON.stringify(tokens));
  console.log("\nTokens saved to token.json");
  rl.close();
});
