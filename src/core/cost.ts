import type { Extra } from "./types.ts";

export interface CostParts {
  coin: number;
  potion: number;
  debt: number;
  extra: Extra;
}

/** Build a compact human-readable cost string. Empty string = no cost shown. */
export function formatCost(coin: number, potion: number, debt: number, extra: string): string {
  let s = "";
  if (coin > 0) s += `$${coin}`;
  if (potion) s += "P";
  if (debt) s += (s ? "+" : "") + `${debt}D`;
  if (extra) s += extra;
  return s;
}

/**
 * Parse a cost token used in queries. Flexible about the dollar sign and case,
 * so both the compact and the displayed form work:
 *
 *   "3"       -> $3                  "$3"      -> $3
 *   "3p"      -> $3 + Potion         "$3P"     -> $3 + Potion
 *   "p"       -> Potion only
 *   "4d3"     -> $4 + 3 debt         "$4+3D"   -> $4 + 3 debt
 *   "d8"      -> 8 debt              "$8+8D"   -> $8 + 8 debt
 *   "7*"      -> $7 (special)        "$7*"     -> $7 (special)
 *   "2+"      -> $2 (overpay)        "$2+"     -> $2 (overpay)
 *   "0"       -> $0
 *
 * Returns null when the token is not a valid cost.
 */
export function parseCostToken(tok: string): CostParts | null {
  let s = tok.trim().toLowerCase().replace(/\s+/g, "");
  if (s === "") return null;
  if (s.startsWith("$")) s = s.slice(1);

  // Trailing "*" (special) or "+" (overpay).
  let extra: Extra = "";
  if (s.endsWith("+")) {
    extra = "+";
    s = s.slice(0, -1);
  } else if (s.endsWith("*")) {
    extra = "*";
    s = s.slice(0, -1);
  }

  // Debt may be written joined ("4d3") or with a separator ("4+3d").
  let coinPart = s;
  let debt = 0;
  const plus = s.indexOf("+");
  if (plus >= 0) {
    coinPart = s.slice(0, plus);
    const dm = /^(\d+)d$/.exec(s.slice(plus + 1));
    if (!dm) return null;
    debt = Number(dm[1]);
  }

  let coin = 0;
  let potion = 0;
  const withDebt = /^(\d*)(p)?d(\d+)$/.exec(coinPart);
  const debtOnly = withDebt ? null : /^(\d+)d$/.exec(coinPart);
  if (withDebt) {
    coin = withDebt[1] ? Number(withDebt[1]) : 0;
    potion = withDebt[2] ? 1 : 0;
    debt = Number(withDebt[3]);
  } else if (debtOnly) {
    debt = Number(debtOnly[1]);
  } else {
    const plain = /^(\d*)(p)?$/.exec(coinPart);
    if (!plain) return null;
    coin = plain[1] ? Number(plain[1]) : 0;
    potion = plain[2] ? 1 : 0;
  }

  return { coin, potion, debt, extra };
}
