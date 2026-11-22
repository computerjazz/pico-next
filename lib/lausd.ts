import * as cheerio from "cheerio";
import type { Element } from "domhandler";

const BASE = "https://lausd.yumyummi.com";
const ENDPOINT = `${BASE}/webapp/ajax-school-menus-weekly/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";

export function todayInLA(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
}

/** ISO week + ISO week-year for a YYYY-MM-DD string. */
export function isoWeek(dateStr: string): { week: number; year: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day); // Thursday of this week
  const year = dt.getUTCFullYear();
  const week = Math.ceil(
    ((dt.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7,
  );
  return { week, year };
}

const MEAL_SLUG: Record<string, string> = {
  BF: "breakfast",
  L: "lunch",
  A: "afterschool",
};

export interface FetchParams {
  sid?: string; // school id
  sg?: string; // school slug
  mg?: string; // meal group code ("BF" = breakfast)
  date?: string; // YYYY-MM-DD
  calendar?: "weekly" | "daily" | "monthly";
}

export async function fetchMenuHtml({
  date = todayInLA(),
  sid = "",
  sg = "",
  mg = "BF",
  calendar = "weekly",
}: FetchParams): Promise<string> {
  const { week, year } = isoWeek(date);

  const body = new URLSearchParams({
    week: String(week),
    year: String(year),
    sid,
    sg,
    mg,
    calendar,
  });

  const referer = `${BASE}/webapp/${sg}/weekly/${MEAL_SLUG[mg] ?? "breakfast"}`;
  const headers: Record<string, string> = {
    accept: "text/html, */*; q=0.01",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    origin: BASE,
    referer,
    "user-agent": UA,
    "x-requested-with": "XMLHttpRequest",
  };

  // Pick up a session cookie first (CodeIgniter's ci_session).
  try {
    const warm = await fetch(referer, {
      headers: { "user-agent": UA },
      cache: "no-store",
    });
    const cookies = warm.headers.getSetCookie?.() ?? [];
    if (cookies.length)
      headers.cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  } catch {
    /* cookie is best-effort */
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`YumYummi responded ${res.status}`);
  return res.text();
}

// ---------- types ----------

export interface Dish {
  id: number;
  name: string;
  servingSize: string | null;
  description: string | null;
  imageUrl: string | null;
  allergens: string[];
  nutrients: Record<string, number>; // e.g. { "Calories": 200, "Protein (gm)": 5 }
}

export interface DishGroup {
  name: string; // e.g. "Breakfast-Milk Options"
  note: string | null; // e.g. "Upon Request Only"
  dishes: Dish[];
}

export interface MealDay {
  date: string; // YYYY-MM-DD
  dishes: Dish[]; // top-level items
  groups: DishGroup[]; // collapsible option groups
}

export interface Menu {
  id: number;
  name: string; // e.g. "PREP Grades K-5 BREAKFAST (Subject To Change)"
  days: MealDay[];
}

// ---------- parse ----------

const clean = (s: string | undefined | null) =>
  (s ?? "").replace(/\s+/g, " ").trim();

/** Pull `key: '...'` out of a popover_make({...}) script body. */
function jsString(js: string, key: string): string | null {
  const m = js.match(new RegExp(`(?:^|\\s)${key}:\\s*'((?:\\\\.|[^'\\\\])*)'`));
  return m ? m[1].replace(/\\(.)/g, "$1") : null;
}

function jsonArray<T>(js: string, key: string): T[] {
  const raw = jsString(js, key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

interface Meta {
  imageUrl: string | null;
  description: string | null;
  servingSize: string | null;
  allergens: string[];
  nutrients: Record<string, number>;
}

export function parseMenus(html: string): Menu[] {
  const $ = cheerio.load(html);

  // Each dish has a sibling <script> calling popover_make('.dish-entry-id-N a', {...})
  // holding the details (description, nutrients, allergens...). Index them by entry id.
  const meta = new Map<string, Meta>();
  $("script").each((_, el) => {
    const js = $(el).html() ?? "";
    const m = js.match(/popover_make\(\s*['"]\.dish-entry-id-(\d+) a['"]/);
    if (!m) return;
    const allergens = jsonArray<{ name: string }>(js, "dish_allergens").map(
      (a) => clean(a.name),
    );
    const nutrients = Object.fromEntries(
      jsonArray<{ name: string; qty: string }>(js, "dish_nutritions").map(
        (n) => [n.name, Number(n.qty)],
      ),
    );
    meta.set(m[1], {
      imageUrl: jsString(js, "image"),
      description:
        clean(jsString(js, "dish_description")?.replace(/`/g, "'")) || null, // source uses ` for apostrophes
      servingSize: clean(jsString(js, "dish_serving_size")) || null,
      allergens: [...new Set(allergens)],
      nutrients,
    });
  });

  const buildDish = (el: Element): Dish => {
    const $d = $(el);
    const entryId = $d.attr("class")?.match(/dish-entry-id-(\d+)/)?.[1];
    const m = entryId ? meta.get(entryId) : undefined;
    const link = $d.find("a").first();
    return {
      id: Number($d.attr("data-dish-id")),
      name: clean(link.attr("aria-label") ?? link.text()),
      servingSize: m?.servingSize ?? null,
      description: m?.description ?? null,
      imageUrl: m?.imageUrl ?? null,
      allergens: m?.allergens ?? [],
      nutrients: m?.nutrients ?? {},
    };
  };

  const buildDay = (td: Element): Day => {
    const $td = $(td);
    const date =
      $td
        .find(".daydate")
        .attr("data-speech-text")
        ?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    const dishes: Dish[] = [];
    const groups: DishGroup[] = [];

    $td
      .find(".dishes")
      .first()
      .children()
      .each((_, child) => {
        const $c = $(child);
        if ($c.is(".dish")) {
          dishes.push(buildDish(child));
        } else if ($c.is(".groupcontainer")) {
          groups.push({
            name: clean($c.find(".dish-group-wm").first().text()),
            note:
              clean($c.find(".groupitemscontainer > p").first().text()) || null,
            dishes: $c
              .find(".groupitemscontainer .dish")
              .toArray()
              .map(buildDish),
          });
        }
      });

    return { date, dishes, groups };
  };

  return $('div.menu[id^="menu-dishes"]')
    .toArray()
    .map((el) => {
      const id = Number($(el).attr("id")!.replace("menu-dishes", ""));
      return {
        id,
        name: clean($(`a.name[rel="${id}"]`).first().text()),
        days: $(el).find("table.calendar td.day").toArray().map(buildDay),
      };
    });
}

export async function getMealData(fetchParams: FetchParams = {}) {
  const html = await fetchMenuHtml(fetchParams);
  const menus = parseMenus(html);
  console.log("menus", menus);
  return {
    menus,
  };
}
