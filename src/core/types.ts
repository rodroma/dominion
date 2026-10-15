/** Core domain types shared by the engine, builder and PWA. */

export type Extra = "" | "*" | "+";

export interface Card {
  name: string;
  set: string;
  types: string[];
  coin: number;
  potion: number;
  debt: number;
  extra: Extra;
  /** Human-readable cost, e.g. "$3P", "4D", "$4+3D", "$6*". */
  cost: string;
  /** Cleaned English rules text. */
  text: string;
  /** Copies in the supply (0 when not a supply card). */
  supply: number;
  kingdom: boolean;
  landscape: boolean;
  base: boolean;
  promo: boolean;
  /** "" | "1E" | "2E" */
  edition: string;
  /** Name of the pile this card belongs to, or "". */
  pile: string;
  illustrator: string;
  /** Wiki image file name, e.g. "Smithy.jpg". */
  wikiFile: string;
}

export interface Pile {
  name: string;
  set: string;
  cost: string;
  types: string[];
  members: string[];
}

export interface Bundle {
  version: string;
  cards: Card[];
  piles: Pile[];
}
