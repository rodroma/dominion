import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCost } from "../core/cost.ts";
import type { RawBundle, RawCard, RawPile } from "../core/bundle.ts";
import { FLAG } from "../core/bundle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DATA = resolve(ROOT, "data");

/** Shape of records as emitted by the scraper (data/cards.json). */
interface SourceCard {
  name: string;
  set: string;
  types: string[];
  cost: { coin: number; potion: number; debt: number; extra: string };
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

function maxSupply(s: number[] | undefined): number {
  if (!s || s.length === 0) return 0;
  return Math.max(...s);
}

/**
 * Split the flat source list into individual `cards` and `piles`.
 * A pile is any entry named as a parent of other cards, or containing a "/".
 * The combined pile entry itself is not a card.
 */
export function splitCardsAndPiles(src: SourceCard[]): {
  cards: SourceCard[];
  piles: RawPile[];
} {
  const pileNames = new Set<string>();
  for (const c of src) if (c.parent_pile) pileNames.add(c.parent_pile);
  for (const c of src) if (c.name.includes("/")) pileNames.add(c.name);

  const byName = new Map(src.map((c) => [c.name, c]));
  const cards = src.filter((c) => !pileNames.has(c.name));

  const piles: RawPile[] = [];
  for (const name of pileNames) {
    const members = src.filter((c) => c.parent_pile === name && c.name !== name);
    if (members.length === 0) continue;
    const rep = byName.get(name);
    const set = rep?.set ?? members[0].set;
    const cost = rep
      ? formatCost(rep.cost.coin, rep.cost.potion, rep.cost.debt, rep.cost.extra)
      : "";
    const types = rep ? rep.types : [...new Set(members.flatMap((m) => m.types))];
    piles.push({ n: name, s: set, c: cost, t: types, m: members.map((m) => m.name) });
  }
  piles.sort((a, b) => a.n.localeCompare(b.n));
  return { cards, piles };
}

function toRawCard(c: SourceCard): RawCard {
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
    p: maxSupply(c.supply),
    x: c.text_clean,
    f,
    e: c.edition,
    l: c.parent_pile,
    a: c.illustrator,
    w: c.wiki_file,
  };
}

export function buildBundle(src: SourceCard[], version: string): RawBundle {
  const { cards, piles } = splitCardsAndPiles(src);
  return { v: version, cards: cards.map(toRawCard), piles };
}

function jsonCompact(o: unknown): string {
  return JSON.stringify(o);
}

function main(): void {
  const srcPath = resolve(DATA, "cards.json");
  const bytes = readFileSync(srcPath);
  const src = JSON.parse(bytes.toString("utf8")) as SourceCard[];
  const version = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  const bundle = buildBundle(src, version);

  mkdirSync(DATA, { recursive: true });
  const compact = Buffer.from(jsonCompact(bundle));
  const out = resolve(DATA, "bundle.json");
  writeFileSync(out, jsonCompact(bundle));
  const hashed = resolve(DATA, `bundle.${version}.json`);
  writeFileSync(hashed, compact);
  writeFileSync(resolve(DATA, `bundle.${version}.json.br`), brotliCompressSync(compact));

  const piles = bundle.piles.length;
  const cards = bundle.cards.length;
  console.log(
    `bundle ${version}: ${cards} cards, ${piles} piles  ` +
      `(raw ${(compact.length / 1024).toFixed(1)} KB, ` +
      `gz ${(gzipSync(compact).length / 1024).toFixed(1)} KB, ` +
      `br ${(brotliCompressSync(compact).length / 1024).toFixed(1)} KB)`,
  );
  console.log(`wrote ${out}`);
  console.log(`wrote ${hashed}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
