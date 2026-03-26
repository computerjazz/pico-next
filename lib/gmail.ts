import { google } from "googleapis";
import {
  extractAllImgSrcs,
  ParsedUspsMessage,
  parseUspsInformedDeliveryHtml,
} from "./usps-digest";

export * from "./usps-digest";

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);
const token = JSON.parse(process.env.GOOGLE_TOKEN_JSON!);

const { client_id, client_secret, redirect_uris } = credentials.installed;
type Message = Awaited<ReturnType<typeof fetchMessages>>["messages"][0];

export const auth = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0],
);

auth.setCredentials(token);

export const gmail = google.gmail({ version: "v1", auth });

function findHtmlPart(
  part: Message["data"]["payload"],
): Message["data"]["payload"] | null {
  if (!part) return null;
  if (part.mimeType === "text/html" && part.body?.data) return part;
  for (const p of part.parts ?? []) {
    const found = findHtmlPart(p);
    if (found) return found;
  }
  return null;
}

export function htmlFromMessagePayload(
  payload: Message["data"]["payload"],
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

export function filterUspsMessages({ messages }: { messages: Message[] }) {
  const filteredMessages = messages
    .map((message) => {
      const headers = message.data.payload?.headers || [];
      const from = headers.find((h) => h.name === "From")?.value || "";
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const isFromUsps = /informeddelivery\.usps\.com/i.test(from);
      const isDailyDigest = subject.toLowerCase().includes("daily digest");
      const isOverride = subject.toLowerCase().includes("[override]");
      if ((isFromUsps && isDailyDigest) || isOverride) {
        return message;
      } else {
        return null;
      }
    })
    .filter((m): m is Message => !!m);

  return { messages: filteredMessages };
}

export function parseUspsMessage({ message }: { message: Message }) {
  const html = htmlFromMessagePayload(message.data.payload);
  const digest = parseUspsInformedDeliveryHtml(html);
  const images = extractAllImgSrcs(html);

  const parsedMessage: ParsedUspsMessage = {
    id: message.id,
    message,
    images,
    digest,
  };
  return parsedMessage;
}

export async function fetchMessages({ historyId }: { historyId: string }) {
  const history = await gmail.users.history.list({
    userId: "me",
    startHistoryId: historyId,
    historyTypes: ["messageAdded"],
  });

  const messageIds =
    history.data.history
      ?.flatMap((h) => h.messagesAdded?.map((m) => m.message?.id))
      ?.filter((mId): mId is string => !!mId) ?? [];

  const messages = await Promise.all(
    messageIds.map(async (mId) => {
      const message = await gmail.users.messages.get({
        userId: "me",
        id: mId,
        format: "full",
      });
      return { ...message, id: mId };
    }),
  );

  return { messages };
}
