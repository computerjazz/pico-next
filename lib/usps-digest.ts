import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import z from "zod";

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
  images: z.array(z.string()),
  digest: UspsDigestParseSchema.nullable(),
  message: z.unknown(), // Replace `z.unknown()` with a proper schema for `Message` if available
});
export type ParsedUspsMessage = z.infer<typeof ParsedUspsMessageSchema>;

function parseIntText(text: string): number | null {
  const n = parseInt(text.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function extractPackagesInSection(
  $: CheerioAPI,
  root: Cheerio<Element>,
  section: UspsPackageSection,
): UspsDigestPackage[] {
  const out: UspsDigestPackage[] = [];
  // Desktop row has both shipper + tracking; mobile duplicates tracking in a second row — skip `#tracking-number-href-id-secondary`.
  root.find('a[id="tracking-number-href-id"]').each((_, a) => {
    const row = $(a).closest("tr");
    const shipper = row
      .find('[id="pra-shipper-name-id"]')
      .first()
      .text()
      .trim();
    const trackingNumber = $(a)
      .find('[id="pra-tracking-number-id"]')
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

  const summary: UspsDigestSummary = {
    inboundMailpieces: parseIntText(
      $('[id="total-mailpieces"]').first().text(),
    ),
    inboundPackages: parseIntText($('[id="total-packages"]').first().text()),
    expectedTodayMailItems: parseIntText(
      $('[id="today-mailitem-number"]').first().text(),
    ),
    expectedTodayPackageItems: parseIntText(
      $('[id="today-package-item-number"]').first().text(),
    ),
    expectedOneTwoDayPackageItems: parseIntText(
      $('[id="onetwodays-package-item-number"]').first().text(),
    ),
    awaitingSenderPackageItems: parseIntText(
      $('[id="awaiting-package-item-number"]').first().text(),
    ),
    outboundPackageItems: parseIntText(
      $('[id="outbound-package-item-number"]').first().text(),
    ),
  };

  const sectionRoots: { id: string; section: UspsPackageSection }[] = [
    { id: "today-package-div", section: "expected_today" },
    { id: "soon-package-div", section: "expected_1_2_days" },
    { id: "awaiting-sender-package-div", section: "awaiting_sender" },
    { id: "outbound-package-div", section: "outbound" },
  ];

  const packages: UspsDigestPackage[] = [];
  for (const { id, section } of sectionRoots) {
    const root = $(`[id="${id}"]`);
    if (!root.length) continue;
    packages.push(...extractPackagesInSection($, root, section));
  }

  const mailpieceImageRefs: string[] = [];
  $('[id="mailpiece-image-src-id"]').each((_, el) => {
    const src = $(el).attr("src");
    if (src?.startsWith("cid:")) mailpieceImageRefs.push(src);
  });

  return { summary, packages, mailpieceImageRefs };
}

export function extractAllImgSrcs(html: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (src) out.push(src);
  });
  return out;
}

export function parseStringifiedMessages(messagesString: string | null) {
  if (!messagesString) return [];
  const messages = JSON.parse(messagesString);
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => {
    const m = ParsedUspsMessageSchema.safeParse(message);
    if (m.success) return m;
  });
}
