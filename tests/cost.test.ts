import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCostToken, formatCost } from "../src/core/cost.ts";
import { resolveSets } from "../src/core/sets.ts";

test("formatCost", () => {
  assert.equal(formatCost(4, 0, 0, ""), "$4");
  assert.equal(formatCost(3, 1, 0, ""), "$3P");
  assert.equal(formatCost(0, 1, 0, ""), "P");
  assert.equal(formatCost(0, 0, 4, ""), "4D");
  assert.equal(formatCost(4, 0, 3, ""), "$4+3D");
  assert.equal(formatCost(8, 0, 8, ""), "$8+8D");
  assert.equal(formatCost(6, 0, 0, "*"), "$6*");
  assert.equal(formatCost(2, 0, 0, "+"), "$2+");
  assert.equal(formatCost(0, 0, 0, ""), "");
});

test("parseCostToken", () => {
  assert.deepEqual(parseCostToken("3"), { coin: 3, potion: 0, debt: 0, extra: "" });
  assert.deepEqual(parseCostToken("3p"), { coin: 3, potion: 1, debt: 0, extra: "" });
  assert.deepEqual(parseCostToken("p"), { coin: 0, potion: 1, debt: 0, extra: "" });
  assert.deepEqual(parseCostToken("4d3"), { coin: 4, potion: 0, debt: 3, extra: "" });
  assert.deepEqual(parseCostToken("d8"), { coin: 0, potion: 0, debt: 8, extra: "" });
  assert.deepEqual(parseCostToken("7*"), { coin: 7, potion: 0, debt: 0, extra: "*" });
  assert.deepEqual(parseCostToken("2+"), { coin: 2, potion: 0, debt: 0, extra: "+" });
  assert.deepEqual(parseCostToken("0"), { coin: 0, potion: 0, debt: 0, extra: "" });
  assert.equal(parseCostToken("foo"), null);
  assert.equal(parseCostToken(""), null);
});

test("parseCostToken accepts $ and the displayed form", () => {
  // An implicit/optional "$" is allowed.
  assert.deepEqual(parseCostToken("$4d3"), { coin: 4, potion: 0, debt: 3, extra: "" });
  assert.deepEqual(parseCostToken("$2"), { coin: 2, potion: 0, debt: 0, extra: "" });
  assert.deepEqual(parseCostToken("$3P"), { coin: 3, potion: 1, debt: 0, extra: "" });
  // The exact string formatCost prints round-trips back into a query.
  for (const [coin, potion, debt, extra] of [
    [4, 0, 3, ""],
    [8, 0, 8, ""],
    [3, 1, 0, ""],
    [0, 0, 4, ""],
    [0, 1, 0, ""],
    [6, 0, 0, "*"],
    [2, 0, 0, "+"],
  ]) {
    const shown = formatCost(coin, potion, debt, extra);
    assert.deepEqual(
      parseCostToken(shown),
      { coin, potion, debt, extra },
      `round-trip failed for ${shown}`,
    );
  }
});

test("set aliases and umbrella matching", () => {
  assert.deepEqual(resolveSets("base"), ["Dominion"]);
  assert.deepEqual(resolveSets("dominion"), ["Dominion"]);
  assert.deepEqual(resolveSets("c&g"), ["Cornucopia & Guilds"]);
  assert.deepEqual(resolveSets("dark"), ["Dark Ages"]);
  assert.deepEqual(resolveSets("cornucopia").sort(), ["Cornucopia", "Cornucopia & Guilds"]);
  assert.deepEqual(resolveSets("guilds").sort(), ["Cornucopia & Guilds", "Guilds"]);
});
