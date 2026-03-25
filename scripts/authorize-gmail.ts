import fs from "fs";
import readline from "readline";
import { google } from "googleapis";

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);

const { client_id, client_secret, redirect_uris } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0],
);

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
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
