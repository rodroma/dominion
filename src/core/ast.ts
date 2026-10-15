export type Op = ":" | "=" | "!=" | "<" | "<=" | ">" | ">=";

export type ScalarValue =
  | { t: "word"; v: string }
  | { t: "quoted"; v: string }
  | { t: "regex"; v: string; flags: string };

export type Value = ScalarValue | { t: "list"; v: Value[] };

export type Node =
  | { k: "and"; l: Node; r: Node }
  | { k: "or"; l: Node; r: Node }
  | { k: "not"; c: Node }
  | { k: "pred"; field: string; op: Op; value: Value }
  | { k: "text"; value: ScalarValue };

/** Serialize an AST for `--explain` output. */
export function stringify(n: Node): string {
  switch (n.k) {
    case "and":
      return `(and ${stringify(n.l)} ${stringify(n.r)})`;
    case "or":
      return `(or ${stringify(n.l)} ${stringify(n.r)})`;
    case "not":
      return `(not ${stringify(n.c)})`;
    case "pred":
      return `(${n.field} ${n.op} ${valStr(n.value)})`;
    case "text":
      return `(text ${valStr(n.value)})`;
  }
}

function valStr(v: Value): string {
  switch (v.t) {
    case "word":
      return v.v;
    case "quoted":
      return JSON.stringify(v.v);
    case "regex":
      return `/${v.v}/${v.flags}`;
    case "list":
      return `(${v.v.map(valStr).join(" or ")})`;
  }
}
