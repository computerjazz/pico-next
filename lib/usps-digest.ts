import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import z from "zod";
import { fetchMessageAttachmentData, htmlFromMessage, Message } from "./gmail";
import {
  cropBase64ImageQuadrant,
  extractOCRText,
  getJsonSizeBytes,
  shrinkBase64Image,
} from "./utils";

/** USPS repeats ids like `pra-shipper-name-id`; always scope under a section container. */
const uspsPackacheSectionSchema = z.enum([
  "expected_today",
  "expected_1_2_days",
  "awaiting_sender",
  "outbound",
]);

export type UspsPackageSection = z.infer<typeof uspsPackacheSectionSchema>;

export const UspsDigestPackageSchema = z.object({
  section: uspsPackacheSectionSchema,
  shipper: z.string(),
  trackingNumber: z.string(),
  trackingUrl: z.string().nullable(),
});
export type UspsDigestPackage = z.infer<typeof UspsDigestPackageSchema>;

export const UspsDigestSummarySchema = z.object({
  inboundMailpieces: z.number().nullable(),
  inboundPackages: z.number().nullable(),
  expectedTodayMailItems: z.number().nullable(),
  expectedTodayPackageItems: z.number().nullable(),
  expectedOneTwoDayPackageItems: z.number().nullable(),
  awaitingSenderPackageItems: z.number().nullable(),
  outboundPackageItems: z.number().nullable(),
});
export type UspsDigestSummary = z.infer<typeof UspsDigestSummarySchema>;

const MailpieceImageSchema = z.object({
  cid: z.string(),
  imageType: z.enum(["mailpiece", "campaign", "ridealong", "unknown"]),
  section: z.string().nullable(),
  sender: z.string().nullable(),
  alt: z.string().nullable(),
  sourceElementId: z.string().nullable(),
  contentId: z.string().nullable(),
  attachmentId: z.string().nullable(),
  filename: z.string().nullable(),
  mimeType: z.string().nullable(),
  /** Base64-encoded content normalized from Gmail's base64url payload. */
  base64Data: z.string().nullable(),
  dataUrl: z.string().nullable(),
  ocrText: z.string().optional().nullable(),
});

type MailpieceImage = z.infer<typeof MailpieceImageSchema>;

export const UspsDigestParseSchema = z.object({
  summary: UspsDigestSummarySchema,
  packages: z.array(UspsDigestPackageSchema),
  /** `cid:` refs for grayscale mail scans (not logos/ads). */
  mailpieceImageRefs: z.array(z.string()),
  mailpieceImages: z.array(MailpieceImageSchema).optional().nullable(),
});
export type UspsDigestParse = z.infer<typeof UspsDigestParseSchema>;

export const ParsedUspsMessageSchema = z.object({
  id: z.string(),
  digest: UspsDigestParseSchema.nullable(),
  message: z.unknown(), // Replace `z.unknown()` with a proper schema for `Message` if available
});
export type ParsedUspsMessage = z.infer<typeof ParsedUspsMessageSchema>;

function parseIntText(text: string): number | null {
  const n = parseInt(text.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function extractPackagesInSection(
  $: CheerioAPI,
  root: Cheerio<Element>,
  section: UspsPackageSection,
): UspsDigestPackage[] {
  const out: UspsDigestPackage[] = [];
  // Desktop row has both shipper + tracking; mobile duplicates tracking in a second row — skip `#tracking-number-href-id-secondary`.
  root.find('a[id*="tracking-number-href-id"]').each((_, a) => {
    const row = $(a).closest("tr");
    const shipper = row
      .find('[id*="pra-shipper-name-id"]')
      .first()
      .text()
      .trim();
    const trackingNumber = $(a)
      .find('[id*="pra-tracking-number-id"]')
      .first()
      .text()
      .trim();
    const trackingUrl = $(a).attr("href")?.trim() ?? null;
    if (!shipper && !trackingNumber) return;
    out.push({ section, shipper, trackingNumber, trackingUrl });
  });
  return out;
}

function normalizeCid(value: string): string {
  const v = value.trim();
  if (v.startsWith("cid:")) return v.toLowerCase();
  return `cid:${v.replace(/^<|>$/g, "").toLowerCase()}`;
}

function toBase64FromGmailBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  if (pad === 0) return normalized;
  return normalized + "=".repeat(4 - pad);
}

function estimatedBytesFromBase64(base64Data: string) {
  return Math.floor((base64Data.length * 3) / 4);
}

function inferImageType({
  id,
  alt,
}: {
  id: string | undefined;
  alt: string | undefined;
}) {
  const key = `${id ?? ""} ${alt ?? ""}`.toLowerCase();
  if (key.includes("mailpiece")) return "mailpiece" as const;
  if (key.includes("ridealong")) return "ridealong" as const;
  if (key.includes("campaign")) return "campaign" as const;
  return "unknown" as const;
}

function inferSection($el: Cheerio<Element>) {
  const sectionRoot = $el.closest(
    '[id*="expected-today"], [id*="mailpiece-div-id"]',
  );
  if (sectionRoot.length) return "expected_today";
  return null;
}

function inferSender($: CheerioAPI, $el: Cheerio<Element>) {
  const cardRoot = $el.closest("table, div");
  const sender =
    cardRoot.find('[id*="campaign-from-span-id"]').first().text().trim() ||
    cardRoot.find('[id*="pra-shipper-name-id"]').first().text().trim() ||
    null;
  return sender;
}

function flattenParts(
  part: Message["data"]["payload"] | undefined,
  out: Array<NonNullable<Message["data"]["payload"]>> = [],
) {
  if (!part) return out;
  out.push(part);
  (part.parts ?? []).forEach((p) => flattenParts(p, out));
  return out;
}

/**
 * Parses Informed Delivery daily digest HTML. Plain-text parts do not list per-package data;
 * rely on `#packages-section` and per-section div ids from the USPS template.
 */

export function parseUspsInformedDeliveryHtml(html: string): UspsDigestParse {
  const $ = cheerio.load(html);

  function parseById({ id }: { id: string }) {
    return parseIntText($(`[id*="${id}"]`).first().text());
  }

  const summary: UspsDigestSummary = {
    inboundMailpieces: parseById({ id: "total-mailpieces" }),
    inboundPackages: parseById({ id: "total-packages" }),
    expectedTodayMailItems: parseById({ id: "today-mailitem-number" }),
    expectedTodayPackageItems: parseById({ id: "today-package-item-number" }),
    expectedOneTwoDayPackageItems: parseById({
      id: "onetwodays-package-item-number",
    }),
    awaitingSenderPackageItems: parseById({
      id: "awaiting-package-item-number",
    }),
    outboundPackageItems: parseById({ id: "outbound-package-item-number" }),
  };

  const sectionRoots: { id: string; section: UspsPackageSection }[] = [
    { id: "today-package-div", section: "expected_today" },
    { id: "soon-package-div", section: "expected_1_2_days" },
    { id: "awaiting-sender-package-div", section: "awaiting_sender" },
    { id: "outbound-package-div", section: "outbound" },
  ];

  const packagesMap = sectionRoots.reduce((acc, { id, section }) => {
    const root = $(`[id*="${id}"]`);
    if (!root.length) return acc;
    const pkgs = extractPackagesInSection($, root, section);
    pkgs.forEach((pkg) => {
      const existingPkg = acc.get(pkg.trackingNumber);
      acc.set(pkg.trackingNumber, existingPkg?.shipper ? existingPkg : pkg);
    });
    return acc;
  }, new Map<string, UspsDigestPackage>());

  const imageRefs = $('[src^="cid:"]');
  const mailpieceImages = imageRefs
    .map((_, el) => {
      const $el = $(el);
      const src = $el.attr("src");
      if (!src) return null;
      const cid = normalizeCid(src);
      const id = $el.attr("id");
      const alt = $el.attr("alt")?.trim() || null;
      return {
        cid,
        imageType: inferImageType({ id, alt: alt ?? undefined }),
        section: inferSection($el),
        sender: inferSender($, $el),
        alt,
        sourceElementId: id ?? null,
        contentId: null,
        attachmentId: null,
        filename: null,
        mimeType: null,
        base64Data: null,
        dataUrl: null,
      };
    })
    .get()
    .filter((i): i is NonNullable<typeof i> => !!i);

  // Preserve legacy field but keep only actual mailpiece scans.
  const mailpieceImageRefs = mailpieceImages
    .filter((img) => img.imageType === "mailpiece")
    .map((img) => img.cid);

  const packages = [...packagesMap.values()];

  return { summary, packages, mailpieceImageRefs, mailpieceImages };
}

export function parseStringifiedUspsMessages(
  messagesString: string | null,
): { digest: UspsDigestParse; epochTimestamp: string | null } | null {
  if (!messagesString) return null;
  const messages = JSON.parse(messagesString);
  if (!Array.isArray(messages)) return null;
  const allMessages = messages
    .map((message) => {
      const m = ParsedUspsMessageSchema.safeParse(message);
      if (m.success) return m.data;
    })
    .filter((m): m is ParsedUspsMessage => !!m);
  const latestMessage = allMessages.sort((a, b) => {
    const aEpochTimestamp = Number(
      (a.message as Message).data.internalDate || 0,
    );
    const bEpochTimestamp = Number(
      (b.message as Message).data.internalDate || 0,
    );
    return aEpochTimestamp > bEpochTimestamp ? -1 : 1;
  })[0];
  if (!latestMessage?.digest) return null;
  return {
    digest: latestMessage.digest,
    epochTimestamp:
      (latestMessage.message as Message)?.data.internalDate || null,
  };
}

export function filterUspsMessages({ messages }: { messages: Message[] }) {
  const filteredMessages = messages
    .map((message) => {
      const headers = message.data.payload?.headers || [];
      const from = headers.find((h) => h.name === "From")?.value || "";
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const isFromUsps = /informeddelivery\.usps\.com/i.test(from);
      const isDailyDigest = subject.toLowerCase().includes("daily digest");
      const isOverride =
        isDailyDigest && subject.toLowerCase().includes("[override]");
      const isDailyDigestEmail = isFromUsps && isDailyDigest;
      if (isDailyDigestEmail || isOverride) {
        return message;
      } else {
        return null;
      }
    })
    .filter((m): m is Message => !!m);

  return { messages: filteredMessages };
}

export async function parseUspsMessage({ message }: { message: Message }) {
  const { html } = htmlFromMessage({ message });
  const digestFromHtml = parseUspsInformedDeliveryHtml(html);
  const parts = flattenParts(message.data.payload);
  const partByCid = parts.reduce(
    (acc, part) => {
      const headers = part.headers ?? [];
      const contentId = headers
        .find((h) => (h.name ?? "").toLowerCase() === "content-id")
        ?.value?.trim();
      const xAttachmentId = headers
        .find((h) => (h.name ?? "").toLowerCase() === "x-attachment-id")
        ?.value?.trim();
      const aliases = [contentId, xAttachmentId]
        .filter((v): v is string => !!v)
        .map((v) => normalizeCid(v));
      aliases.forEach((alias) => {
        acc.set(alias, {
          contentId: contentId ?? null,
          attachmentId: part.body?.attachmentId ?? null,
          filename: part.filename?.trim() || null,
          mimeType: part.mimeType ?? null,
          data: part.body?.data ?? null,
        });
      });
      return acc;
    },
    new Map<
      string,
      {
        contentId: string | null;
        attachmentId: string | null;
        filename: string | null;
        mimeType: string | null;
        data: string | null;
      }
    >(),
  );

  const mailpieceImages = await Promise.all(
    (digestFromHtml.mailpieceImages ?? []).map(async (img) => {
      const part = partByCid.get(img.cid);
      if (!part) return img;
      let base64Data = part.data ? toBase64FromGmailBase64Url(part.data) : null;
      if (!base64Data && part.attachmentId) {
        try {
          const { data } = await fetchMessageAttachmentData({
            messageId: message.id,
            attachmentId: part.attachmentId,
          });
          base64Data = data ? toBase64FromGmailBase64Url(data) : null;
        } catch {
          // Keep metadata if attachment fetch fails.
        }
      }
      return {
        ...img,
        contentId: part.contentId,
        attachmentId: part.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? "image/jpeg",
        base64Data,
        dataUrl: null,
      };
    }),
  );

  const imagesWithData = mailpieceImages.filter(
    (img): img is (typeof mailpieceImages)[number] & { base64Data: string } =>
      typeof img.base64Data === "string" && img.base64Data.length > 0,
  );

  const digest: UspsDigestParse = {
    ...digestFromHtml,
    mailpieceImages: imagesWithData.filter(
      (img) => img.imageType === "mailpiece",
    ),
  };
  const parsedMessage: ParsedUspsMessage = {
    id: message.id,
    message,
    digest,
  };
  return parsedMessage;
}

export async function getBudgetedImages({
  mailpieceImages,
  totalImagePayloadBytes = 50 * 1024,
}: {
  mailpieceImages: MailpieceImage[];
  totalImagePayloadBytes?: number;
}) {
  const perImageBudget = Math.max(
    4 * 1024,
    Math.floor(totalImagePayloadBytes / Math.max(1, mailpieceImages.length)),
  );

  const budgetedImages = await Promise.all(
    mailpieceImages.map(async (img) => {
      if (!img.base64Data) return img;
      const shrunk = await shrinkBase64Image({
        base64Data: img.base64Data,
        targetBytes: perImageBudget,
      });
      console.log("shrunk!", getJsonSizeBytes(shrunk.base64Data));
      return {
        ...img,
        mimeType: shrunk.mimeType,
        base64Data: shrunk.base64Data,
      };
    }),
  );

  let totalBytes = budgetedImages.reduce((sum, img) => {
    if (!img.base64Data) return sum;
    return sum + estimatedBytesFromBase64(img.base64Data);
  }, 0);

  // Last-resort cap: if still over budget, drop largest images until we fit.
  if (totalBytes > totalImagePayloadBytes) {
    const bySize = budgetedImages
      .map((img, index) => ({
        index,
        bytes: img.base64Data ? estimatedBytesFromBase64(img.base64Data) : 0,
      }))
      .sort((a, b) => b.bytes - a.bytes);
    for (const entry of bySize) {
      if (totalBytes <= totalImagePayloadBytes) break;
      const img = budgetedImages[entry.index];
      if (!img.base64Data) continue;
      totalBytes -= estimatedBytesFromBase64(img.base64Data);
      budgetedImages[entry.index] = {
        ...img,
        base64Data: null,
        dataUrl: null,
      };
    }
  }
  return budgetedImages;
}

export async function enforcePayloadBudget({
  digest,
  maxSizeInBytes,
}: {
  digest?: UspsDigestParse | null;
  maxSizeInBytes: number;
}) {
  if (!digest) return null;

  const { mailpieceImages: rawImages } = digest;
  if (!Array.isArray(rawImages)) {
    return digest;
  }

  const images = await getBudgetedImages({ mailpieceImages: rawImages });
  const budgetedDigest: UspsDigestParse = {
    ...digest,
    mailpieceImages: images,
  };

  const imageIndexesByBase64Size = images
    .map((img, index) => ({
      index,
      size:
        typeof img.base64Data === "string"
          ? Buffer.byteLength(img.base64Data, "utf8")
          : 0,
    }))
    .sort((a, b) => b.size - a.size);

  for (const { index } of imageIndexesByBase64Size) {
    if (getJsonSizeBytes(budgetedDigest) <= maxSizeInBytes) break;
    images[index] = {
      ...images[index],
      base64Data: null,
    };
  }

  // Last resort: clear all thumbnails if still over budget.
  if (getJsonSizeBytes(digest) > maxSizeInBytes) {
    digest.mailpieceImages = images.map((img) => ({
      ...img,
      base64Data: null,
      dataUrl: null,
    }));
  }

  return budgetedDigest;
}

export async function extractSenderText(base64Data?: string | null) {
  if (!base64Data) return "";
  const { dataUrl: croppedDataUrl } = await cropBase64ImageQuadrant({
    base64Data: base64Data,
    quadrant: "upperLeft",
  });
  const { text: ocrText } = await extractOCRText({
    imageBase64DataUrl: croppedDataUrl,
  });
  const firstLine = ocrText.split("\n")[0];
  const firstLineTitle = firstLine.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  return firstLineTitle;
}
