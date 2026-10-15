import type { Card, Extra, Pile, Bundle } from "./types.ts";
import { formatCost } from "./cost.ts";

/** Wire format emitted by the builder (short keys to keep the payload small). */
export interface RawCard {
  n: string; // name
  s: string; // set
  t: string[]; // types
  c: [number, number, number, string]; // coin, potion, debt, extra
  p: number; // supply
  x: string; // text (cleaned)
  f: number; // flags bitfield
  e: string; // edition
  l: string; // pile
  a: string; // illustrator
  w: string; // wiki file
}

export interface RawPile {
  n: string;
  s: string;
  c: string; // cost display
  t: string[];
  m: string[]; // members
}

export interface RawBundle {
  v: string;
  cards: RawCard[];
  piles: RawPile[];
}

export const FLAG = {
  kingdom: 1,
  landscape: 2,
  base: 4,
  promo: 8,
} as const;

export function decodeBundle(raw: RawBundle): Bundle {
  const cards: Card[] = raw.cards.map((r) => ({
    name: r.n,
    set: r.s,
    types: r.t,
    coin: r.c[0],
    potion: r.c[1],
    debt: r.c[2],
    extra: r.c[3] as Extra,
    cost: formatCost(r.c[0], r.c[1], r.c[2], r.c[3]),
    text: r.x,
    supply: r.p,
    kingdom: (r.f & FLAG.kingdom) !== 0,
    landscape: (r.f & FLAG.landscape) !== 0,
    base: (r.f & FLAG.base) !== 0,
    promo: (r.f & FLAG.promo) !== 0,
    edition: r.e,
    pile: r.l,
    illustrator: r.a,
    wikiFile: r.w,
  }));
  const piles: Pile[] = raw.piles.map((r) => ({
    name: r.n,
    set: r.s,
    cost: r.c,
    types: r.t,
    members: r.m,
  }));
  return { version: raw.v, cards, piles };
}
