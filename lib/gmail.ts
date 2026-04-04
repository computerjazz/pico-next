import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
const client = new OAuth2Client();

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);
const token = JSON.parse(process.env.GOOGLE_TOKEN_JSON!);

const { client_id, client_secret, redirect_uris } = credentials.web;

export type Message = Awaited<ReturnType<typeof fetchMessages>>["messages"][0];

export const auth = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0],
);

auth.setCredentials(token);

export const gmail = google.gmail({ version: "v1", auth });

export function findHtmlPart(
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

export function htmlFromMessage({ message }: { message: Message }) {
  const { payload } = message.data;
  if (!payload) return { html: "" };
  const direct =
    payload.mimeType === "text/html" && payload.body?.data ? payload : null;
  const htmlPart = direct ?? findHtmlPart(payload);
  if (!htmlPart?.body?.data) return { html: "" };
  const decoded = Buffer.from(htmlPart.body.data, "base64").toString("utf-8");
  return { html: decoded };
}

// Register a watch
export async function startWatch() {
  console.log("start watch", client_id, process.env.GOOGLE_TOPIC_NAME);
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: process.env.GOOGLE_TOPIC_NAME!,
    },
  });
  console.log("Watch response:", res.data);
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
  console.log("messageIds", messageIds);
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

export async function fetchMessageAttachmentData({
  messageId,
  attachmentId,
}: {
  messageId: string;
  attachmentId: string;
}) {
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  return { data: res.data.data ?? null };
}

export async function validateGoogleToken({
  token,
}: {
  token?: string | null;
}) {
  try {
    if (!token) return false;
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.NEXT_PUBLIC_BASE_URL + "/api/gmail-webhook",
    });
    const payload = ticket.getPayload();
    const isValid = payload?.email === process.env.GOOGLE_PUBSUB_EMAIL;
    console.log("validate google auth: ", isValid, payload);
    return isValid;
  } catch (err) {
    console.error("failed to validate Google token", err);
    return false;
  }
}
