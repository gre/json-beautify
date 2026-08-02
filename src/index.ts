/**
 * json-beautify — JSON serialization with a fixed maximum line width.
 *
 * Implements ECMA-262 §25.5.4 (`JSON.stringify`): for every value, replacer
 * and space it accepts, the output is character-identical to `JSON.stringify`.
 *
 * Two deliberate divergences, both in the API rather than the serialization:
 * the extra `limit` parameter, which keeps an object or array on a single line
 * until its inline form would exceed that many characters; and stricter
 * argument validation — a `replacer` that is neither a function nor an array
 * throws here, where `JSON.stringify` would silently ignore it.
 *
 * The helpers below are named after the spec's abstract operations so that
 * future spec changes map onto the code directly. One structural difference:
 * the spec threads the current indentation through the mutable `[[Indent]]`
 * field of its state record, whereas here it is an ordinary parameter, so that
 * nested calls — e.g. a `toJSON` that itself calls `beautify` — cannot clobber
 * each other's state.
 */

export type Replacer =
  | ((this: unknown, key: string, value: unknown) => unknown)
  | Array<string | number>
  | null;

/** §25.5.4.3 Table 78: JSON Single Character Escape Sequences. */
const SINGLE_ESCAPES: Record<string, string> = {
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
  '"': '\\"',
  "\\": "\\\\",
};

// Exactly what §25.5.4.3 step 2 requires: the escapes above, anything below
// U+0020, and lone surrogates. The `u` flag is what restricts `\p{Surrogate}`
// to *lone* surrogates — a well-formed pair is a single non-surrogate code
// point — and escaping those is what keeps the output well-formed Unicode.
// oxlint-disable-next-line no-control-regex -- matching them is the point
const ESCAPABLE = /[\u0000-\u001f"\\]|\p{Surrogate}/gu;

/** §25.5.4.4 UnicodeEscape */
function unicodeEscape(codeUnit: string): string {
  return "\\u" + codeUnit.charCodeAt(0).toString(16).padStart(4, "0");
}

/** §25.5.4.3 QuoteJSONString */
function quoteJSONString(value: string): string {
  return '"' + value.replace(ESCAPABLE, (ch) => SINGLE_ESCAPES[ch] ?? unicodeEscape(ch)) + '"';
}

/**
 * Collapse a Number/String/Boolean/BigInt wrapper to its primitive, covering
 * the `[[NumberData]]`/`[[StringData]]`/`[[BooleanData]]`/`[[BigIntData]]`
 * checks in §25.5.4 step 6 and §25.5.4.2 step 4. Returns `value` unchanged
 * when it is not a wrapper.
 */
function unwrapBoxed(value: object): unknown {
  if (
    value instanceof Number ||
    value instanceof String ||
    value instanceof Boolean ||
    value instanceof BigInt
  ) {
    return value.valueOf();
  }

  // Wrappers from another realm fail `instanceof`, so fall back to probing the
  // internal slot. Gating on the brand keeps ordinary objects (`[object
  // Object]`) away from the throwing path; the `try` then covers objects that
  // merely spoof the brand via `Symbol.toStringTag`.
  switch (Object.prototype.toString.call(value)) {
    case "[object Number]":
      try {
        return Number.prototype.valueOf.call(value);
      } catch {
        return value;
      }
    case "[object String]":
      try {
        return String.prototype.valueOf.call(value);
      } catch {
        return value;
      }
    case "[object Boolean]":
      try {
        return Boolean.prototype.valueOf.call(value);
      } catch {
        return value;
      }
    case "[object BigInt]":
      try {
        return BigInt.prototype.valueOf.call(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}

/**
 * §25.5.4.2 step 4.a. `JSON.isRawJSON` is the only way to observe the
 * `[[IsRawJSON]]` slot, and it exists only from Node 22; older runtimes have
 * no raw JSON values to detect in the first place.
 */
const rawJSONCheck = (JSON as { isRawJSON?: (value: unknown) => boolean }).isRawJSON;
const isRawJSON: (value: object) => boolean =
  typeof rawJSONCheck === "function" ? (value) => rawJSONCheck(value) : () => false;

/** §25.5.4 steps 6-9: normalize `space` into the indentation unit ([[Gap]]). */
function toGap(space: unknown): string {
  const value = space !== null && typeof space === "object" ? unwrapBoxed(space) : space;

  if (typeof value === "number") {
    // ToIntegerOrInfinity truncates toward zero, then the result is capped at
    // 10 — which is also what turns Infinity into a usable count.
    const count = Math.min(10, Number.isNaN(value) ? 0 : Math.trunc(value));
    return count < 1 ? "" : " ".repeat(count);
  }

  if (typeof value === "string") {
    return value.length <= 10 ? value : value.slice(0, 10);
  }

  return "";
}

/**
 * §25.5.4 step 5.b.ii: turn a replacer array into `[[PropertyList]]`, a
 * de-duplicated list of keys. Numbers are stringified, and String/Number
 * wrappers are unwrapped — but not Boolean ones, which the spec skips.
 */
function toPropertyList(replacer: readonly unknown[]): string[] {
  const list: string[] = [];

  for (const entry of replacer) {
    let key: string | undefined;

    if (typeof entry === "string") {
      key = entry;
    } else if (typeof entry === "number") {
      key = String(entry);
    } else if (entry !== null && typeof entry === "object") {
      const unwrapped = unwrapBoxed(entry);
      if (typeof unwrapped === "string" || typeof unwrapped === "number") {
        key = String(unwrapped);
      }
    }

    if (key !== undefined && !list.includes(key)) list.push(key);
  }

  return list;
}

/** §25.5.4.1 JSON Serialization Record, minus [[Indent]] (threaded instead). */
interface State {
  replacerFunction: ((this: unknown, key: string, value: unknown) => unknown) | undefined;
  propertyList: string[] | undefined;
  gap: string;
  stack: object[];
  limit: number;
}

/**
 * Join already-serialized members. This is where json-beautify departs from
 * the spec: rather than always breaking when a gap is set, a run stays inline
 * as long as it fits within `limit` characters.
 */
function wrap(
  partial: string[],
  open: string,
  close: string,
  stepBack: string,
  indent: string,
  state: State,
): string {
  if (partial.length === 0) return open + close;
  if (!state.gap) return open + partial.join(",") + close;

  const inline = partial.join(", ");
  if (indent.length + inline.length + 4 <= state.limit) {
    return open + " " + inline + " " + close;
  }
  return open + "\n" + indent + partial.join(",\n" + indent) + "\n" + stepBack + close;
}

/** §25.5.4.6 SerializeJSONArray */
function serializeJSONArray(value: unknown[], indent: string, state: State): string {
  if (state.stack.includes(value)) {
    throw new TypeError("Converting circular structure to JSON");
  }
  state.stack.push(value);

  const stepBack = indent;
  const childIndent = indent + state.gap;
  const partial: string[] = [];

  for (let i = 0; i < value.length; i += 1) {
    partial.push(serializeJSONProperty(String(i), value, childIndent, state) ?? "null");
  }

  state.stack.pop();
  return wrap(partial, "[", "]", stepBack, childIndent, state);
}

/** §25.5.4.5 SerializeJSONObject */
function serializeJSONObject(value: object, indent: string, state: State): string {
  if (state.stack.includes(value)) {
    throw new TypeError("Converting circular structure to JSON");
  }
  state.stack.push(value);

  const stepBack = indent;
  const childIndent = indent + state.gap;
  const partial: string[] = [];
  // Step 6.a: EnumerableOwnProperties(value, key).
  const keys = state.propertyList ?? Object.keys(value);

  for (const key of keys) {
    const member = serializeJSONProperty(key, value, childIndent, state);
    if (member !== undefined) {
      partial.push(quoteJSONString(key) + (state.gap ? ": " : ":") + member);
    }
  }

  state.stack.pop();
  return wrap(partial, "{", "}", stepBack, childIndent, state);
}

/** §25.5.4.2 SerializeJSONProperty */
function serializeJSONProperty(
  key: string,
  holder: object,
  indent: string,
  state: State,
): string | undefined {
  let value: unknown = (holder as Record<string, unknown>)[key];

  // Step 2: objects — callables included — and BigInts get a `toJSON` hook.
  // BigInt is in that list purely so that a user-installed
  // `BigInt.prototype.toJSON` can rescue a value step 10 would else reject.
  if (
    (value !== null && (typeof value === "object" || typeof value === "function")) ||
    typeof value === "bigint"
  ) {
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") {
      value = (toJSON as (this: unknown, key: string) => unknown).call(value, key);
    }
  }

  if (state.replacerFunction !== undefined) {
    value = state.replacerFunction.call(holder, key, value);
  }

  // Step 4: raw JSON is spliced in verbatim; wrappers collapse to primitives.
  if (value !== null && typeof value === "object") {
    if (isRawJSON(value)) return (value as { rawJSON: string }).rawJSON;
    value = unwrapBoxed(value);
  }

  switch (typeof value) {
    case "string":
      return quoteJSONString(value);

    case "number":
      return Number.isFinite(value) ? String(value) : "null";

    case "boolean":
      return String(value);

    case "bigint":
      // Step 10.
      throw new TypeError("Do not know how to serialize a BigInt");

    case "object": {
      if (value === null) return "null";
      return Array.isArray(value)
        ? serializeJSONArray(value, indent, state)
        : serializeJSONObject(value, indent, state);
    }

    default:
      // undefined, function, symbol: no JSON representation.
      return undefined;
  }
}

/**
 * Same signature as `JSON.stringify`, plus an optional 4th `limit` parameter:
 * the maximum line width (e.g. 80) before a nested object or array is broken
 * onto multiple lines. Without a `limit`, output matches `JSON.stringify`
 * character for character.
 *
 * Stricter than `JSON.stringify` in one respect: a `replacer` that is neither
 * a function nor an array, or a non-numeric `limit`, throws rather than being
 * silently ignored. Serialization of everything it accepts is unaffected.
 *
 * @throws {Error} on a malformed `replacer` or `limit`.
 * @throws {TypeError} on a BigInt value or a circular structure, per §25.5.4.
 */
export default function beautify(
  value: unknown,
  replacer?: Replacer,
  space?: number | string,
  limit?: number,
): string {
  if (replacer != null && typeof replacer !== "function" && !Array.isArray(replacer)) {
    throw new Error("beautify: wrong replacer parameter");
  }

  if (limit !== undefined && typeof limit !== "number") {
    throw new Error("beautify: limit must be a number");
  }

  const state: State = {
    replacerFunction: typeof replacer === "function" ? replacer : undefined,
    propertyList: Array.isArray(replacer) ? toPropertyList(replacer) : undefined,
    gap: toGap(space),
    stack: [],
    limit: limit || 0,
  };

  return serializeJSONProperty("", { "": value }, "", state) as string;
}
