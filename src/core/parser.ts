import { tokenize, QueryError, OPS, type Token } from "./lexer.ts";
import type { Node, Op, Value } from "./ast.ts";

class Parser {
  private pos = 0;
  private toks: Token[];
  constructor(toks: Token[]) {
    this.toks = toks;
  }

  private peek(offset = 0): Token {
    return this.toks[Math.min(this.pos + offset, this.toks.length - 1)];
  }
  private next(): Token {
    return this.toks[this.pos++];
  }

  parse(): Node {
    const node = this.parseOr();
    if (this.peek().type !== "eof") {
      throw new QueryError(`Unexpected token '${this.peek().value}' at ${this.peek().pos}`);
    }
    return node;
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.peek().type === "or") {
      this.next();
      const right = this.parseAnd();
      left = { k: "or", l: left, r: right };
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type === "and") {
        this.next();
        left = { k: "and", l: left, r: this.parseUnary() };
      } else if (t.type === "eof" || t.type === "rparen" || t.type === "or") {
        break;
      } else {
        // implicit AND
        left = { k: "and", l: left, r: this.parseUnary() };
      }
    }
    return left;
  }

  private parseUnary(): Node {
    const t = this.peek();
    if (t.type === "not" || t.type === "minus") {
      this.next();
      return { k: "not", c: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const t = this.peek();
    if (t.type === "lparen") {
      this.next();
      const inner = this.parseOr();
      if (this.peek().type !== "rparen") {
        throw new QueryError(`Expected ')' at ${this.peek().pos}`);
      }
      this.next();
      return inner;
    }
    if (t.type === "word") {
      const nxt = this.peek(1);
      if (nxt.type === "op") {
        this.next(); // field
        const op = this.next().value as Op;
        const value = this.parseValue();
        return { k: "pred", field: t.value.toLowerCase(), op, value };
      }
      this.next();
      return { k: "text", value: { t: "word", v: t.value } };
    }
    if (t.type === "quoted") {
      this.next();
      return { k: "text", value: { t: "quoted", v: t.value } };
    }
    if (t.type === "regex") {
      this.next();
      return { k: "text", value: { t: "regex", v: t.value, flags: t.flags ?? "" } };
    }
    throw new QueryError(`Unexpected token '${t.value || t.type}' at ${t.pos}`);
  }

  private parseValue(): Value {
    const t = this.peek();
    if (t.type === "lparen") {
      this.next();
      const items: Value[] = [];
      for (;;) {
        items.push(this.parseValue());
        const nxt = this.peek();
        if (nxt.type === "or" || nxt.type === "and") {
          this.next();
          continue;
        }
        break;
      }
      if (this.peek().type !== "rparen") {
        throw new QueryError(`Expected ')' in value list at ${this.peek().pos}`);
      }
      this.next();
      return { t: "list", v: items };
    }
    if (t.type === "quoted") {
      this.next();
      return { t: "quoted", v: t.value };
    }
    if (t.type === "regex") {
      this.next();
      return { t: "regex", v: t.value, flags: t.flags ?? "" };
    }
    if (t.type === "word" || t.type === "minus") {
      this.next();
      return { t: "word", v: t.value };
    }
    throw new QueryError(`Expected a value at ${t.pos}`);
  }
}

export function parse(input: string): Node {
  const toks = tokenize(input);
  // An empty query matches everything.
  if (toks.length === 1 && toks[0].type === "eof") {
    return { k: "text", value: { t: "word", v: "" } };
  }
  return new Parser(toks).parse();
}
