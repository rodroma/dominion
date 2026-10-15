import type { Bundle, Card, Pile } from "./types.ts";
import { parse } from "./parser.ts";
import { evaluate } from "./eval.ts";
import { stringify } from "./ast.ts";

export interface SearchOptions {
  includePiles?: boolean;
}

export interface SearchResult {
  cards: Card[];
  piles: Pile[];
}

function pileAsCard(p: Pile): Card {
  return {
    name: p.name,
    set: p.set,
    types: p.types,
    coin: 0,
    potion: 0,
    debt: 0,
    extra: "",
    cost: p.cost,
    text: "",
    supply: 0,
    kingdom: false,
    landscape: false,
    base: false,
    promo: false,
    edition: "",
    pile: "",
    illustrator: "",
    wikiFile: "",
  };
}

export type GroupField =
  | "set"
  | "type"
  | "cost"
  | "debt"
  | "potion"
  | "edition"
  | "artist"
  | "pile";

function groupValues(card: Card, field: GroupField): string[] {
  switch (field) {
    case "set":
      return [card.set];
    case "type":
      return card.types.length ? card.types : ["(none)"];
    case "cost":
      return [card.cost || "(none)"];
    case "debt":
      return [String(card.debt)];
    case "potion":
      return [String(card.potion)];
    case "edition":
      return [card.edition || "(none)"];
    case "artist":
      return [card.illustrator || "(unknown)"];
    case "pile":
      return [card.pile || "(none)"];
  }
}

export class Engine {
  readonly cards: Card[];
  readonly piles: Pile[];
  readonly version: string;

  constructor(bundle: Bundle) {
    this.cards = bundle.cards;
    this.piles = bundle.piles;
    this.version = bundle.version;
  }

  /** Parse a query without executing it (throws QueryError on syntax problems). */
  explain(query: string): string {
    return stringify(parse(query));
  }

  search(query: string, opts: SearchOptions = {}): SearchResult {
    const ast = parse(query);
    const cards = this.cards.filter((c) => evaluate(ast, c));
    const piles = opts.includePiles
      ? this.piles.filter((p) => evaluate(ast, pileAsCard(p)))
      : [];
    return { cards, piles };
  }

  count(query: string): number {
    const ast = parse(query);
    let n = 0;
    for (const c of this.cards) if (evaluate(ast, c)) n++;
    return n;
  }

  groupBy(query: string, field: GroupField): Map<string, number> {
    const ast = parse(query);
    const out = new Map<string, number>();
    for (const c of this.cards) {
      if (!evaluate(ast, c)) continue;
      for (const key of groupValues(c, field)) {
        out.set(key, (out.get(key) ?? 0) + 1);
      }
    }
    return out;
  }
}

export const GROUP_FIELDS: GroupField[] = [
  "set",
  "type",
  "cost",
  "debt",
  "potion",
  "edition",
  "artist",
  "pile",
];
