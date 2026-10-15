/** Canonical set names (from the wiki's Module:Sets) plus fuzzy aliases. */

export const SETS: string[] = [
  "Adventures",
  "Alchemy",
  "Allies",
  "Cornucopia",
  "Cornucopia & Guilds",
  "Dark Ages",
  "Dominion",
  "Empires",
  "Guilds",
  "Hinterlands",
  "Intrigue",
  "Menagerie",
  "Nocturne",
  "Plunder",
  "Promos",
  "Prosperity",
  "Renaissance",
  "Rising Sun",
  "Seaside",
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ALIASES: Record<string, string[]> = {
  base: ["Dominion"],
  core: ["Dominion"],
  basegame: ["Dominion"],
  cg: ["Cornucopia & Guilds"],
  cornucopiaguilds: ["Cornucopia & Guilds"],
  dark: ["Dark Ages"],
  rising: ["Rising Sun"],
  promo: ["Promos"],
};

// Umbrella matching: these names intentionally expand to more than one set.
const ALIASES_EXTRA: Record<string, string[]> = {
  cornucopia: ["Cornucopia", "Cornucopia & Guilds"],
  guilds: ["Guilds", "Cornucopia & Guilds"],
};

const LOOKUP: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const s of SETS) m.set(norm(s), [s]);
  for (const [k, v] of Object.entries(ALIASES)) if (!m.has(k)) m.set(k, v);
  for (const [k, v] of Object.entries(ALIASES_EXTRA)) m.set(k, v);
  return m;
})();

/** Resolve a set query value to one or more canonical set names. */
export function resolveSets(value: string): string[] {
  const key = norm(value);
  return LOOKUP.get(key) ?? [];
}

export function isKnownSet(value: string): boolean {
  return LOOKUP.has(norm(value));
}
