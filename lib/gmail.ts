import { google } from "googleapis";
import * as cheerio from "cheerio";

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);
const token = JSON.parse(process.env.GOOGLE_TOKEN_JSON!);

const { client_id, client_secret, redirect_uris } = credentials.installed;

export const auth = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0],
);

auth.setCredentials(token);

export const gmail = google.gmail({ version: "v1", auth });

// Register a watch
export async function startWatch() {
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: "projects/apt-deployment-491305-a0/topics/gmail-incoming-mail",
    },
  });
  console.log("Watch response:", res.data);
}

export async function fetchNewUspsEmails(historyId: string) {
  const history = await gmail.users.history.list({
    userId: "me",
    startHistoryId: historyId,
    historyTypes: ["messageAdded"],
  });

  const messages =
    history.data.history?.flatMap(
      (h) => h.messagesAdded?.map((m) => m.message?.id) || [],
    ) || [];

  const uspsEmails: { id: string; images: string[] }[] = [];

  for (const msgId of messages) {
    const message = await gmail.users.messages.get({
      userId: "me",
      id: msgId ?? undefined,
      format: "full",
    });

    const headers = message.data.payload?.headers || [];
    const from = headers.find((h) => h.name === "From")?.value || "";
    const subject = headers.find((h) => h.name === "Subject")?.value || "";

    // Only handle USPS Informed Delivery
    if (!from.includes("informed.delivery@usps.com")) continue;
    if (!subject.includes("Informed Delivery")) continue;

    // Extract images
    const htmlPart = message.data.payload?.parts?.find(
      (p) => p.mimeType === "text/html",
    );
    const html = htmlPart?.body?.data
      ? Buffer.from(htmlPart.body.data, "base64").toString("utf-8")
      : "";

    const $ = cheerio.load(html);
    const images: string[] = [];
    $("img").each((_, el) => {
      const src = $(el).attr("src");
      if (src) images.push(src);
    });
    if (msgId) {
      uspsEmails.push({ id: msgId, images });
    }
  }

  return uspsEmails;
}
