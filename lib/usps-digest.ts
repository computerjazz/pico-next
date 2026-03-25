import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

/** USPS repeats ids like `pra-shipper-name-id`; always scope under a section container. */
export type UspsPackageSection =
  | "expected_today"
  | "expected_1_2_days"
  | "awaiting_sender"
  | "outbound";

export interface UspsDigestPackage {
  section: UspsPackageSection;
  shipper: string;
  trackingNumber: string;
  trackingUrl: string | null;
}

export interface UspsDigestSummary {
  inboundMailpieces: number | null;
  inboundPackages: number | null;
  expectedTodayMailItems: number | null;
  expectedTodayPackageItems: number | null;
  expectedOneTwoDayPackageItems: number | null;
  awaitingSenderPackageItems: number | null;
  outboundPackageItems: number | null;
}

export interface UspsDigestParse {
  summary: UspsDigestSummary;
  packages: UspsDigestPackage[];
  /** `cid:` refs for grayscale mail scans (not logos/ads). */
  mailpieceImageRefs: string[];
}

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
