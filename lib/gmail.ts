import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import {
  extractAllImgSrcs,
  parseUspsInformedDeliveryHtml,
} from "./usps-digest";
import type { UspsDigestParse } from "./usps-digest";

export * from "./usps-digest";

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

function findHtmlPart(
  part: gmail_v1.Schema$MessagePart | undefined,
): gmail_v1.Schema$MessagePart | null {
  if (!part) return null;
  if (part.mimeType === "text/html" && part.body?.data) return part;
  for (const p of part.parts ?? []) {
    const found = findHtmlPart(p);
    if (found) return found;
  }
  return null;
}

export function htmlFromMessagePayload(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string {
  if (!payload) return "";
  const direct =
    payload.mimeType === "text/html" && payload.body?.data ? payload : null;
  const htmlPart = direct ?? findHtmlPart(payload);
  if (!htmlPart?.body?.data) return "";
  return Buffer.from(htmlPart.body.data, "base64").toString("utf-8");
}

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

  const uspsEmails: {
    id: string;
    images: string[];
    digest: UspsDigestParse | null;
  }[] = [];

  for (const msgId of messages) {
    const message = await gmail.users.messages.get({
      userId: "me",
      id: msgId ?? undefined,
      format: "full",
    });

    const headers = message.data.payload?.headers || [];
    const from = headers.find((h) => h.name === "From")?.value || "";
    const subject = headers.find((h) => h.name === "Subject")?.value || "";

    // Only handle USPS Informed Delivery (sender may be @email.informeddelivery.usps.com)
    if (!/informeddelivery\.usps\.com/i.test(from)) continue;
    if (!subject.includes("Daily Digest")) continue;

    const html = htmlFromMessagePayload(message.data.payload ?? undefined);
    const digest = html ? parseUspsInformedDeliveryHtml(html) : null;
    const images = html ? extractAllImgSrcs(html) : [];

    if (msgId) {
      uspsEmails.push({ id: msgId, images, digest });
    }
  }

  return uspsEmails;
}
