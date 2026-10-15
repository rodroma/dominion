export type TokType =
  | "lparen"
  | "rparen"
  | "and"
  | "or"
  | "not"
  | "minus"
  | "op"
  | "word"
  | "quoted"
  | "regex"
  | "eof";

export interface Token {
  type: TokType;
  value: string;
  /** regex flags when type === "regex" */
  flags?: string;
  pos: number;
}

const OPS = new Set([":", "=", "!=", "<", "<=", ">", ">="]);
const WORD_STOP = new Set(["(", ")", ":", "=", "<", ">", '"']);

export class QueryError extends Error {}

function isSpace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r";
}

export function tokenize(input: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const c = input[i];
    if (isSpace(c)) {
      i++;
      continue;
    }
    const pos = i;

    if (c === "(") {
      toks.push({ type: "lparen", value: c, pos });
      i++;
      continue;
    }
    if (c === ")") {
      toks.push({ type: "rparen", value: c, pos });
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let buf = "";
      while (j < n && input[j] !== '"') {
        if (input[j] === "\\" && j + 1 < n) {
          buf += input[j + 1];
          j += 2;
        } else {
          buf += input[j];
          j++;
        }
      }
      if (j >= n) throw new QueryError(`Unterminated quote at ${pos}`);
      toks.push({ type: "quoted", value: buf, pos });
      i = j + 1;
      continue;
    }
    // Regex literal: only when a token begins with '/'
    if (c === "/") {
      let j = i + 1;
      let buf = "";
      while (j < n && input[j] !== "/") {
        if (input[j] === "\\" && j + 1 < n) {
          buf += input[j] + input[j + 1];
          j += 2;
        } else {
          buf += input[j];
          j++;
        }
      }
      if (j >= n) throw new QueryError(`Unterminated regex at ${pos}`);
      let k = j + 1;
      let flags = "";
      while (k < n && /[a-z]/i.test(input[k]) && !WORD_STOP.has(input[k])) {
        flags += input[k];
        k++;
      }
      toks.push({ type: "regex", value: buf, flags, pos });
      i = k;
      continue;
    }
    // Operators
    if (c === "!" && input[i + 1] === "=") {
      toks.push({ type: "op", value: "!=", pos });
      i += 2;
      continue;
    }
    if (c === ":" || c === "=") {
      toks.push({ type: "op", value: c, pos });
      i++;
      continue;
    }
    if (c === "<" || c === ">") {
      if (input[i + 1] === "=") {
        toks.push({ type: "op", value: c + "=", pos });
        i += 2;
      } else {
        toks.push({ type: "op", value: c, pos });
        i++;
      }
      continue;
    }
    // Negation prefix
    if (c === "-" && i + 1 < n && !isSpace(input[i + 1])) {
      toks.push({ type: "minus", value: "-", pos });
      i++;
      continue;
    }
    // Word (also handles keywords and bare tokens)
    let j = i;
    let buf = "";
    while (j < n) {
      const d = input[j];
      if (isSpace(d) || WORD_STOP.has(d)) break;
      if (d === "/" && j === i) break; // shouldn't happen
      if (d === "!" && input[j + 1] === "=") break;
      buf += d;
      j++;
    }
    if (buf === "") {
      throw new QueryError(`Unexpected character '${c}' at ${pos}`);
    }
    const lower = buf.toLowerCase();
    if (lower === "and" || lower === "or" || lower === "not") {
      toks.push({ type: lower === "and" ? "and" : lower === "or" ? "or" : "not", value: buf, pos });
    } else {
      toks.push({ type: "word", value: buf, pos });
    }
    i = j;
  }

  toks.push({ type: "eof", value: "", pos: n });
  return toks;
}

export { OPS };
