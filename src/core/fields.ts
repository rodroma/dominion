import type { Card } from "./types.ts";
import type { Op, ScalarValue } from "./ast.ts";
import { parseCostToken } from "./cost.ts";
import { resolveSets } from "./sets.ts";
import { QueryError } from "./lexer.ts";

export type FieldTester = (card: Card, op: Op, value: ScalarValue) => boolean;

function strMatch(hay: string, op: Op, value: ScalarValue): boolean {
  if (value.t === "regex") {
    // Card text is multi-line and case-insensitive by default.
    let flags = value.flags;
    if (!flags.includes("i")) flags += "i";
    if (!flags.includes("s")) flags += "s";
    let re: RegExp;
    try {
      re = new RegExp(value.v, flags);
    } catch {
      throw new QueryError(`Invalid regex /${value.v}/`);
    }
    const m = re.test(hay);
    return op === "!=" ? !m : m;
  }
  const h = hay.toLowerCase();
  const v = value.v.toLowerCase();
  if (op === "=") return h === v;
  if (op === "!=") return !h.includes(v);
  return h.includes(v);
}

/**
 * Match one of a card's enumerated values (types, editions). `=` is exact;
 * `:` and a bare value also accept a prefix, so `t:even` finds Event and
 * `ed:2` finds 2E. Prefix — not substring — is deliberate: substring would
 * make `t:action` also match Reaction.
 */
function enumMatch(values: string[], op: Op, value: ScalarValue): boolean {
  if (value.t === "regex") {
    let flags = value.flags;
    if (!flags.includes("i")) flags += "i";
    let re: RegExp;
    try {
      re = new RegExp(value.v, flags);
    } catch {
      throw new QueryError(`Invalid regex /${value.v}/`);
    }
    const m = values.some((x) => re.test(x));
    return op === "!=" ? !m : m;
  }
  const v = value.v.toLowerCase();
  const exact = values.some((x) => x.toLowerCase() === v);
  const prefix = values.some((x) => x.toLowerCase().startsWith(v));
  if (op === "=") return exact;
  if (op === "!=") return !prefix;
  return prefix;
}

function numMatch(cardVal: number, op: Op, value: ScalarValue): boolean {
  const n = Number(value.v);
  if (Number.isNaN(n)) return false;
  switch (op) {
    case ":":
    case "=":
      return cardVal === n;
    case "!=":
      return cardVal !== n;
    case "<":
      return cardVal < n;
    case "<=":
      return cardVal <= n;
    case ">":
      return cardVal > n;
    case ">=":
      return cardVal >= n;
  }
}

function boolMatch(flag: boolean, op: Op): boolean {
  return op === "!=" ? !flag : flag;
}

const IS_FLAGS: Record<string, (c: Card) => boolean> = {
  kingdom: (c) => c.kingdom,
  landscape: (c) => c.landscape,
  base: (c) => c.base,
  promo: (c) => c.promo,
  supply: (c) => c.supply > 0,
  nonsupply: (c) => c.supply === 0,
  event: (c) => c.types.includes("Event"),
  landmark: (c) => c.types.includes("Landmark"),
  project: (c) => c.types.includes("Project"),
  way: (c) => c.types.includes("Way"),
  trait: (c) => c.types.includes("Trait"),
  ally: (c) => c.types.includes("Ally"),
  attack: (c) => c.types.includes("Attack"),
  duration: (c) => c.types.includes("Duration"),
  reaction: (c) => c.types.includes("Reaction"),
  night: (c) => c.types.includes("Night"),
};

const HAS_FLAGS: Record<string, (c: Card) => boolean> = {
  overpay: (c) => c.extra === "+",
  special: (c) => c.extra === "*",
  text: (c) => c.text.length > 0,
  pile: (c) => c.pile.length > 0,
};

const costTest: FieldTester = (card, op, value) => {
  const parts = parseCostToken(value.v);
  if (!parts) return false;
  const exact =
    card.coin === parts.coin &&
    card.potion === parts.potion &&
    card.debt === parts.debt &&
    card.extra === parts.extra;
  switch (op) {
    case ":":
    case "=":
      return exact;
    case "!=":
      return !exact;
    default:
      // Relational operators compare the coin value only.
      return numMatch(card.coin, op, { t: "word", v: String(parts.coin) });
  }
};

const setTest: FieldTester = (card, op, value) => {
  const sets = resolveSets(value.v);
  const inSet = sets.length > 0 ? sets.includes(card.set) : strMatch(card.set, ":", value);
  return op === "!=" ? !inSet : inSet;
};

const typeTest: FieldTester = (card, op, value) => enumMatch(card.types, op, value);

const isTest: FieldTester = (card, op, value) => {
  if (value.t !== "regex") {
    const fn = IS_FLAGS[value.v.toLowerCase()];
    if (fn) return boolMatch(fn(card), op);
  }
  // Unknown flag: fall back to type matching (which accepts prefixes).
  return enumMatch(card.types, op, value);
};

const hasTest: FieldTester = (card, op, value) => {
  const v = value.v.toLowerCase();
  const fn = HAS_FLAGS[v];
  if (!fn) return false;
  return boolMatch(fn(card), op);
};

const editionTest: FieldTester = (card, op, value) => enumMatch([card.edition], op, value);

export const FIELDS: Record<string, FieldTester> = {
  name: (c, op, v) => strMatch(c.name, op, v),
  set: setTest,
  type: typeTest,
  cost: costTest,
  potion: (c, op, v) => numMatch(c.potion, op, v),
  debt: (c, op, v) => numMatch(c.debt, op, v),
  supply: (c, op, v) => numMatch(c.supply, op, v),
  text: (c, op, v) => strMatch(c.text, op, v),
  artist: (c, op, v) => strMatch(c.illustrator, op, v),
  edition: editionTest,
  pile: (c, op, v) => strMatch(c.pile, op, v),
  is: isTest,
  has: hasTest,
};

export const ALIASES: Record<string, string> = {
  n: "name",
  t: "type",
  s: "set",
  e: "set",
  expansion: "set",
  c: "cost",
  cmc: "cost",
  mana: "cost",
  p: "potion",
  d: "debt",
  o: "text",
  oracle: "text",
  rules: "text",
  ability: "text",
  a: "artist",
  illustrator: "artist",
  count: "supply",
  ed: "edition",
  parent: "pile",
  in: "pile",
};

/** Resolve a field name/alias to its canonical form, or null if unknown. */
export function resolveField(name: string): string | null {
  const n = name.toLowerCase();
  if (n in FIELDS) return n;
  if (n in ALIASES) return ALIASES[n];
  return null;
}

export function fieldExists(name: string): boolean {
  return resolveField(name) !== null;
}
