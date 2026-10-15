/**
 * Optional re-scraper for the Dominion Wiki (Miraheze mirror).
 *
 * The wiki stores every card as a MediaWiki Lua module, so we evaluate those
 * tables with fengari (a Lua VM written in JS) and convert them to the same
 * `data/cards.json` shape used by `build-bundle.ts`.
 *
 * Data is static, so this is only needed when refreshing from upstream:
 *   npm run scrape            # full
 *   node src/build/scrape.ts --limit 5 --out /tmp/cards.sample.json
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCost } from "../core/cost.ts";
import type { RawCard } from "../core/bundle.ts";
import { FLAG } from "../core/bundle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const API = "https://dominionstrategy.miraheze.org/w/api.php";
const UA = "dominion-search/0.1 (dataset builder)";

async function api(params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({ format: "json", ...params });
  const res = await fetch(API, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function listModules(): Promise<string[]> {
  const titles: string[] = [];
  let cont: Record<string, string> = {};
  for (;;) {
    const d = await api({ action: "query", list: "allpages", apnamespace: "828", aplimit: "500", ...cont });
    for (const p of d.query.allpages) titles.push(p.title);
    if (d.continue) cont = d.continue;
    else break;
  }
  return titles.filter((t) => !t.endsWith("/doc"));
}

async function fetchContents(titles: string[]): Promise<Record<string, string>> {
  const store: Record<string, string> = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const d = await api({
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      titles: batch.join("|"),
    });
    for (const p of Object.values<any>(d.query.pages)) {
      store[p.title] = p.revisions?.[0]?.slots?.main?.["*"] ?? "";
    }
  }
  return store;
}

/** Evaluate a `return { ... }` Lua chunk and return the value as JS. */
async function evalLua(code: string): Promise<unknown> {
  const { lua, lauxlib, lualib, to_luastring, to_jsstring } = await import("fengari");

  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  function luaToJs(idx: number): unknown {
    const abs = lua.lua_absindex(L, idx);
    const t = lua.lua_type(L, abs);
    switch (t) {
      case lua.LUA_TNIL:
        return null;
      case lua.LUA_TBOOLEAN:
        return lua.lua_toboolean(L, abs);
      case lua.LUA_TNUMBER:
        return lua.lua_tonumber(L, abs);
      case lua.LUA_TSTRING:
        return to_jsstring(lua.lua_tostring(L, abs));
      case lua.LUA_TTABLE: {
        const arr: unknown[] = [];
        const obj: Record<string, unknown> = {};
        let isArray = true;
        lua.lua_pushnil(L);
        while (lua.lua_next(L, abs) !== 0) {
          const k = luaToJs(-2);
          const v = luaToJs(-1);
          if (typeof k === "number" && Number.isInteger(k) && k >= 1) arr[k - 1] = v;
          else isArray = false;
          obj[String(k)] = v;
          lua.lua_pop(L, 1);
        }
        return isArray && arr.length ? arr : obj;
      }
      default:
        return null;
    }
  }

  const buf = to_luastring(code);
  const status = lauxlib.luaL_loadbuffer(L, buf, buf.length, to_luastring("@module"));
  if (status !== lua.LUA_OK) {
    const err = to_jsstring(lua.lua_tostring(L, -1));
    lua.lua_close(L);
    throw new Error(err);
  }
  const ok = lua.lua_pcall(L, 0, 1, 0);
  if (ok !== lua.LUA_OK) {
    const err = to_jsstring(lua.lua_tostring(L, -1));
    lua.lua_close(L);
    throw new Error(err);
  }
  const value = luaToJs(-1);
  lua.lua_close(L);
  return value;
}

function cleanText(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/\/\//g, "\n");
  s = s.replace(/\[([^\]]*)\]/g, (m, innerRaw: string) => {
    const inner = innerRaw.trim();
    if (inner === "") return "$";
    if (inner === "D") return "Debt";
    if (inner === "P" || inner === "!P") return "P";
    const v = inner.replace(/^!/, "");
    if (/^\d+D$/.test(v)) return v.slice(0, -1) + " Debt";
    if (/^\d+$/.test(v)) return "$" + v;
    return m;
  });
  s = s.replace(/\{([^}]*)\}/g, (_m, innerRaw: string) => {
    let v = innerRaw.trim().replace(/^[!+]/, "");
    if (v === "") v = "1";
    return v + " VP";
  });
  s = s.replace(/%%/g, "").replace(/\|/g, "");
  s = s.replace(/[ \t]+\n/g, "\n").trim();
  return s;
}

interface SourceCard {
  name: string;
  set: string;
  types: string[];
  cost: { coin: number; potion: number; debt: number; extra: string; text: string };
  text: string;
  text_clean: string;
  supply: number[];
  is_kingdom: boolean;
  is_landscape: boolean;
  is_base_card: boolean;
  edition: string;
  parent_pile: string;
  is_split_pile: boolean;
  illustrator: string;
  wiki_file: string;
}

function normalize(title: string, v: any): SourceCard | null {
  if (!v || typeof v !== "object" || !("set" in v) || !("types" in v) || "cards" in v) {
    return null;
  }
  const lang = v.lang ?? {};
  const text = v.text ?? {};
  const cost = v.cost ?? {};
  const en = (o: any) => (o && typeof o === "object" ? o.en ?? "" : "");
  const coin = cost.coin ?? 0;
  const potion = cost.potion ?? 0;
  const debt = cost.debt ?? 0;
  const extra = cost.extra ?? "";
  return {
    name: lang.en || v.name || title.replace("Module:", ""),
    set: v.set,
    types: v.types,
    cost: { coin, potion, debt, extra, text: formatCost(coin, potion, debt, extra) },
    text: en(text),
    text_clean: cleanText(en(text)),
    supply: v.amount ?? [],
    is_kingdom: Boolean(v.isRealSupplyCard) && !v.isBaseCard,
    is_landscape: Boolean(v.isLandscape),
    is_base_card: Boolean(v.isBaseCard),
    edition: v.edition ?? "",
    parent_pile: v.parentPile ?? "",
    is_split_pile: Boolean(v.isPartOfSplitPile),
    illustrator: v.illustrator ?? "",
    wiki_file: v.wiki?.file ?? "",
  };
}

export function toRawCard(c: SourceCard): RawCard {
  let f = 0;
  if (c.is_kingdom) f |= FLAG.kingdom;
  if (c.is_landscape) f |= FLAG.landscape;
  if (c.is_base_card) f |= FLAG.base;
  if (c.set === "Promos") f |= FLAG.promo;
  return {
    n: c.name,
    s: c.set,
    t: c.types,
    c: [c.cost.coin, c.cost.potion, c.cost.debt, c.cost.extra as RawCard["c"][3]],
    p: c.supply.length ? Math.max(...c.supply) : 0,
    x: c.text_clean,
    f,
    e: c.edition,
    l: c.parent_pile,
    a: c.illustrator,
    w: c.wiki_file,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limitArg = argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(argv[limitArg + 1]) : Infinity;
  const outArg = argv.indexOf("--out");
  const out = outArg >= 0 ? argv[outArg + 1] : resolve(ROOT, "data", "cards.json");

  console.log("Listing modules...");
  let titles = await listModules();
  if (Number.isFinite(limit)) titles = titles.slice(0, limit);
  console.log(`  ${titles.length} modules`);
  const store = await fetchContents(titles);

  const cards: SourceCard[] = [];
  let failed = 0;
  for (const [title, code] of Object.entries(store)) {
    if (!code.trimStart().startsWith("return")) continue;
    try {
      const obj = await evalLua(code);
      const card = normalize(title, obj);
      if (card) cards.push(card);
    } catch (e) {
      failed++;
      if (failed <= 5) console.error(`  skip ${title}: ${(e as Error).message}`);
    }
  }
  console.log(`Parsed ${cards.length} cards (${failed} failed)`);
  writeFileSync(out, JSON.stringify(cards, null, 2));
  console.log(`Wrote ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
