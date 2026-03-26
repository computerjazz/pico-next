import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import z from "zod";
import { htmlFromMessage, Message } from "./gmail";

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

export const UspsDigestParseSchema = z.object({
  summary: UspsDigestSummarySchema,
  packages: z.array(UspsDigestPackageSchema),
  /** `cid:` refs for grayscale mail scans (not logos/ads). */
  mailpieceImageRefs: z.array(z.string()),
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

  const mailpieceImageRefs: string[] = [];
  $('[id*="mailpiece-image-src-id"]').each((_, el) => {
    const src = $(el).attr("src");
    if (src?.startsWith("cid:")) mailpieceImageRefs.push(src);
  });

  const packages = [...packagesMap.values()];

  return { summary, packages, mailpieceImageRefs };
}

export function parseStringifiedUspsMessages(messagesString: string | null) {
  if (!messagesString) return {};
  const messages = JSON.parse(messagesString);
  if (!Array.isArray(messages)) return {};
  const allMessages = messages
    .map((message) => {
      const m = ParsedUspsMessageSchema.safeParse(message);
      if (m.success) {
        return m.data.message as Message;
      }
    })
    .filter((m): m is Message => !!m);
  const latestMessage = allMessages.sort((a, b) => {
    const aEpochTimestamp = Number(a.data.internalDate || 0);
    const bEpochTimestamp = Number(b.data.internalDate || 0);
    return aEpochTimestamp > bEpochTimestamp ? -1 : 1;
  })[0];
  if (!latestMessage) return {};
  const { digest } = parseUspsMessage({ message: latestMessage });
  return {
    ...digest,
    epochTimestamp: latestMessage?.data.internalDate,
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

export function parseUspsMessage({ message }: { message: Message }) {
  const { html } = htmlFromMessage({ message });
  const digest = parseUspsInformedDeliveryHtml(html);
  const parsedMessage: ParsedUspsMessage = {
    id: message.id,
    message,
    digest,
  };
  return parsedMessage;
}
