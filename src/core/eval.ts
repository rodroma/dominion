import type { Card } from "./types.ts";
import type { Node, Op, ScalarValue, Value } from "./ast.ts";
import { FIELDS, resolveField } from "./fields.ts";
import { QueryError } from "./lexer.ts";

function testScalar(card: Card, field: string, op: Op, value: ScalarValue): boolean {
  const canonical = resolveField(field);
  if (!canonical) {
    throw new QueryError(`Unknown field '${field}'`);
  }
  return FIELDS[canonical](card, op, value);
}

function testValue(card: Card, field: string, op: Op, value: Value): boolean {
  if (value.t === "list") {
    // `!=` over a list means "none of these"; positive ops mean "any of these".
    if (op === "!=") return value.v.every((item) => testValue(card, field, op, item));
    return value.v.some((item) => testValue(card, field, op, item));
  }
  return testScalar(card, field, op, value);
}

function testText(card: Card, value: ScalarValue): boolean {
  // Free text matches the name or the rules text.
  return FIELDS.name(card, ":", value) || FIELDS.text(card, ":", value);
}

/** Evaluate a parsed query against a single card. */
export function evaluate(node: Node, card: Card): boolean {
  switch (node.k) {
    case "and":
      return evaluate(node.l, card) && evaluate(node.r, card);
    case "or":
      return evaluate(node.l, card) || evaluate(node.r, card);
    case "not":
      return !evaluate(node.c, card);
    case "pred":
      return testValue(card, node.field, node.op, node.value);
    case "text":
      return testText(card, node.value);
  }
}
