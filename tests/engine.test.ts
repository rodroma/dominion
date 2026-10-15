import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBundle } from "../src/build/build-bundle.ts";
import { decodeBundle } from "../src/core/bundle.ts";
import { Engine } from "../src/core/engine.ts";
import { parse } from "../src/core/parser.ts";
import { stringify } from "../src/core/ast.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = JSON.parse(readFileSync(resolve(HERE, "..", "data", "cards.json"), "utf8"));
const engine = new Engine(decodeBundle(buildBundle(src, "test")));

function names(query: string, opts?: { includePiles?: boolean }): string[] {
  const r = engine.search(query, opts);
  return r.cards.map((c) => c.name);
}

test("dataset shape", () => {
  assert.equal(engine.cards.length, 837);
  assert.equal(engine.piles.length, 15);
  // combined pile entries are not cards
  assert.ok(!names("").includes("Catapult/Rocks"));
  assert.ok(!engine.piles.some((p) => engine.cards.some((c) => c.name === p.name)));
});

test("piles reference their members", () => {
  const cr = engine.piles.find((p) => p.name === "Catapult/Rocks");
  assert.ok(cr);
  assert.deepEqual(cr.members.sort(), ["Catapult", "Rocks"]);
});

test("attack costing 3", () => {
  const hits = names("t:attack cost:3");
  assert.equal(hits.length, 8);
  assert.ok(hits.includes("Catapult"));
  assert.ok(!hits.includes("Soldier")); // $3* is not plain $3
  assert.ok(!hits.includes("Catapult/Rocks")); // that's a pile
});

test("cost is composite", () => {
  assert.deepEqual(names("cost:3p").sort(), ["Alchemist", "Familiar", "Philosopher's Stone"]);
  assert.deepEqual(names("cost:p").sort(), ["Transmute", "Vineyard"]);
  assert.ok(names("cost:4d3").includes("Wedding"));
  assert.ok(names("cost:d8").includes("Annex"));
  assert.ok(!names("cost:d8").includes("Engineer")); // Engineer is 4D
  assert.equal(names("cost:7*").length, 16); // 15 Loot + Animal Fair
  assert.deepEqual(names("cost:2+").sort(), ["Farrier", "Stonemason"]);
});

test("component name matching covers split piles", () => {
  assert.ok(names("n:cat").includes("Catapult"));
  assert.ok(names("n:rock").includes("Rocks"));
  // the pile is reachable by component too
  const withPiles = engine.search("n:rock", { includePiles: true });
  assert.ok(withPiles.piles.some((p) => p.name === "Catapult/Rocks"));
});

test("cost tokens accept an implicit $ and the displayed form", () => {
  assert.ok(names("cost:$4d3").includes("Wedding"));
  assert.deepEqual(names("cost:$4d3"), names("cost:4d3"));
  assert.equal(engine.count("c:2"), engine.count("cost:2"));
  assert.equal(engine.count("c:$2"), engine.count("cost:2"));
  assert.deepEqual(names("c:$8+8D"), names("cost:8d8"));
  assert.equal(engine.count("c:$7*"), engine.count("cost:7*"));
  assert.equal(engine.count("c:$3P"), engine.count("cost:3p"));
});

test("set umbrella matching", () => {
  const corn = names("set:cornucopia");
  assert.ok(corn.includes("Fortune Teller")); // Cornucopia
  assert.ok(corn.includes("Carnival")); // Cornucopia & Guilds
  const guilds = names("set:guilds");
  assert.ok(guilds.includes("Doctor")); // Guilds
  assert.ok(guilds.includes("Farrier")); // Cornucopia & Guilds
  assert.ok(!names("set:dominion").includes("Smithy") === false);
});

test("boolean operators, negation and parens", () => {
  assert.equal(names("t:attack cost:3 -set:seaside").length, 7);
  const a = engine.count("set:(empires or adventures) t:duration");
  const b =
    engine.count("set:empires t:duration") + engine.count("set:adventures t:duration");
  assert.equal(a, b);
  assert.equal(engine.count("not t:action"), engine.cards.length - names("t:action").length);
});

test("flags and has:", () => {
  assert.equal(names("has:overpay").length, 6);
  assert.equal(names("has:special").length, 49);
  assert.ok(names("is:event set:menagerie").length >= 20);
  assert.ok(names("is:duration").length > 0);
});

test("free text and regex", () => {
  assert.equal(engine.count("Smithy"), 1);
  assert.ok(engine.count('o:"gain a Gold"') > 0);
  const strict = engine.count("o:/trash.*Gold/");
  const loose = engine.count("o:/trash[\\s\\S]*Gold/");
  assert.equal(strict, loose); // dotAll is on by default
});

test("parser explain round-trips structurally", () => {
  const ast = parse("t:attack cost:3 -set:seaside");
  assert.equal(stringify(ast), "(and (and (t : attack) (cost : 3)) (not (set : seaside)))");
});

test("query errors are reported", () => {
  assert.throws(() => parse("t:attack (cost:3"), /Expected/);
  assert.throws(() => engine.count("bogus:1"), /Unknown field/);
});
