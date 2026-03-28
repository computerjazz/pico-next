import { google } from "googleapis";

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);
const token = JSON.parse(process.env.GOOGLE_TOKEN_JSON!);

const { client_id, client_secret, redirect_uris } = credentials.installed;
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
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: "projects/apt-deployment-491305-a0/topics/gmail-incoming-mail",
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
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`,
    );
    const respJson = await resp.json();
    return respJson["email"] === process.env.GOOGLE_PUBSUB_EMAIL;
  } catch (err) {
    console.error("failed to validate Google token", err);
    return false;
  }
}
