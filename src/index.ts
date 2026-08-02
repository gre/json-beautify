/**
 * json-beautify — JSON.stringify with a fixed maximum character width.
 *
 * Ported from the json2.js stringify algorithm, with each recursive call
 * carrying its own indentation/context state instead of module-level
 * mutable globals (so nested calls, e.g. via a `toJSON` that itself calls
 * `beautify`, can't clobber each other).
 */

export type Replacer =
  | ((this: unknown, key: string, value: unknown) => unknown)
  | Array<string | number>
  | null;

// Control/format characters that JSON must escape. Built from numeric code
// points (rather than literal escape sequences) to keep raw control bytes
// out of the source file.
const ESCAPABLE_RANGES: Array<[number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x0600, 0x0604],
  [0x070f, 0x070f],
  [0x17b4, 0x17b5],
  [0x200c, 0x200f],
  [0x2028, 0x202f],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
  [0xfff0, 0xffff],
];

const ESCAPABLE = new RegExp(
  '[\\\\"' +
    ESCAPABLE_RANGES.map(
      ([from, to]) => String.fromCodePoint(from) + "-" + String.fromCodePoint(to),
    ).join("") +
    "]",
  "g",
);

const META: Record<string, string> = {
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
  '"': '\\"',
  "\\": "\\\\",
};

function quote(value: string): string {
  ESCAPABLE.lastIndex = 0;
  if (!ESCAPABLE.test(value)) return '"' + value + '"';
  return (
    '"' +
    value.replace(
      ESCAPABLE,
      (ch) => META[ch] ?? "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
    ) +
    '"'
  );
}

function wrap(
  partial: string[],
  open: string,
  close: string,
  mind: string,
  gap: string,
  limit: number,
): string {
  if (partial.length === 0) return open + close;
  if (!gap) return open + partial.join(",") + close;

  const inline = partial.join(", ");
  if (gap.length + inline.length + 4 <= limit) {
    return open + " " + inline + " " + close;
  }
  return open + "\n" + gap + partial.join(",\n" + gap) + "\n" + mind + close;
}

interface Context {
  indent: string;
  limit: number;
  replacer: Replacer;
}

function str(
  key: string,
  holder: Record<string, unknown>,
  gap: string,
  ctx: Context,
): string | undefined {
  let value = holder[key];

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toJSON?: unknown }).toJSON === "function"
  ) {
    value = (value as { toJSON: (key: string) => unknown }).toJSON(key);
  }

  if (typeof ctx.replacer === "function") {
    value = ctx.replacer.call(holder, key, value);
  }

  switch (typeof value) {
    case "string":
      return quote(value);

    case "number":
      return isFinite(value) ? String(value) : "null";

    case "boolean":
      return String(value);

    case "object": {
      if (value === null) return "null";

      const mind = gap;
      const childGap = gap + ctx.indent;
      const partial: string[] = [];

      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
          partial.push(
            str(String(i), value as unknown as Record<string, unknown>, childGap, ctx) ?? "null",
          );
        }
        return wrap(partial, "[", "]", mind, childGap, ctx.limit);
      }

      const record = value as Record<string, unknown>;

      if (Array.isArray(ctx.replacer)) {
        for (const k of ctx.replacer) {
          if (typeof k === "string") {
            const v = str(k, record, childGap, ctx);
            if (v !== undefined) partial.push(quote(k) + (childGap ? ": " : ":") + v);
          }
        }
      } else {
        for (const k in record) {
          if (Object.prototype.hasOwnProperty.call(record, k)) {
            const v = str(k, record, childGap, ctx);
            if (v !== undefined) partial.push(quote(k) + (childGap ? ": " : ":") + v);
          }
        }
      }

      return wrap(partial, "{", "}", mind, childGap, ctx.limit);
    }

    default:
      // undefined, function, symbol, bigint: not JSON-representable.
      return undefined;
  }
}

/**
 * Same signature as `JSON.stringify`, plus an optional 4th `limit` parameter:
 * the maximum fixed character width (e.g. 80) before a nested object/array
 * is broken onto multiple lines.
 */
export default function beautify(
  value: unknown,
  replacer?: Replacer,
  space?: number | string,
  limit?: number,
): string {
  let indent = "";
  if (typeof space === "number") {
    indent = " ".repeat(Math.max(0, Math.floor(space)));
  } else if (typeof space === "string") {
    indent = space;
  }

  if (replacer != null && typeof replacer !== "function" && !Array.isArray(replacer)) {
    throw new Error("beautify: wrong replacer parameter");
  }

  if (limit !== undefined && typeof limit !== "number") {
    throw new Error("beautify: limit must be a number");
  }

  const ctx: Context = {
    indent,
    limit: limit || 0,
    replacer: replacer ?? null,
  };

  return str("", { "": value }, "", ctx) as string;
}
