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

/** Sorts object keys: `true` for code-unit order, or a custom comparator. */
export type KeyOrder = boolean | ((a: string, b: string) => number);

/**
 * Everything `beautify` can be told to do, as a single object. This is the
 * preferred form; the positional `JSON.stringify` signature remains supported
 * for drop-in use.
 */
export interface Options {
  /** §25.5.4 `replacer`: a filter function, or an array of keys to keep. */
  replacer?: Replacer;
  /** §25.5.4 `space`: indent width, or the literal indent string. Default 2. */
  space?: number | string;
  /** Maximum line width. Default 80. `0` always breaks, `Infinity` never does. */
  maxWidth?: number;
  /** Sort object keys instead of using their natural order. Default false. */
  sortKeys?: KeyOrder;
  /** Padding inside a single-line array. Default `" "` → `[ 1, 2 ]`. */
  arrayPadding?: string;
  /** Padding inside a single-line object. Default `" "` → `{ "a": 1 }`. */
  objectPadding?: string;
}

const OPTION_KEYS: ReadonlyArray<keyof Options> = [
  "replacer",
  "space",
  "maxWidth",
  "sortKeys",
  "arrayPadding",
  "objectPadding",
];

/** §25.5.4.1 JSON Serialization Record, minus [[Indent]] (threaded instead). */
interface State {
  replacerFunction: ((this: unknown, key: string, value: unknown) => unknown) | undefined;
  propertyList: string[] | undefined;
  gap: string;
  stack: object[];
  maxWidth: number;
  sortKeys: KeyOrder;
  arrayPadding: string;
  objectPadding: string;
}

/**
 * Join already-serialized members. This is where json-beautify departs from the
 * spec: rather than always breaking once a gap is set, a run stays on one line
 * while it fits.
 *
 * `reserved` is the width this line has already committed to everything that is
 * not this value — the indent, the `"key": ` prefix above it, and the comma that
 * will follow it. Counting it is what makes `maxWidth` a real bound rather than
 * an estimate.
 */
function wrap(
  partial: string[],
  isArray: boolean,
  indent: string,
  reserved: number,
  state: State,
): string {
  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";

  if (partial.length === 0) return open + close;
  if (!state.gap) return open + partial.join(",") + close;

  const padding = isArray ? state.arrayPadding : state.objectPadding;
  const inline = open + padding + partial.join(", ") + padding + close;
  // A member that already broke cannot be folded back onto one line.
  if (!inline.includes("\n") && reserved + inline.length <= state.maxWidth) return inline;

  const childIndent = indent + state.gap;
  return open + "\n" + childIndent + partial.join(",\n" + childIndent) + "\n" + indent + close;
}

/** §25.5.4.5 step 6: the keys to serialize, in the order to serialize them. */
function orderedKeys(value: object, state: State): string[] {
  // A replacer array is itself an explicit ordering, so `sortKeys` leaves it be.
  if (state.propertyList !== undefined) return state.propertyList;

  const keys = Object.keys(value);
  if (!state.sortKeys) return keys;
  return keys.sort(typeof state.sortKeys === "function" ? state.sortKeys : undefined);
}

/** §25.5.4.6 SerializeJSONArray */
function serializeJSONArray(
  value: unknown[],
  indent: string,
  reserved: number,
  state: State,
): string {
  if (state.stack.includes(value)) {
    throw new TypeError("Converting circular structure to JSON");
  }
  state.stack.push(value);

  const childIndent = indent + state.gap;
  const partial: string[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const comma = i < value.length - 1 ? 1 : 0;
    const member = serializeJSONProperty(
      String(i),
      value,
      childIndent,
      childIndent.length + comma,
      state,
    );
    partial.push(member ?? "null");
  }

  state.stack.pop();
  return wrap(partial, true, indent, reserved, state);
}

/** §25.5.4.5 SerializeJSONObject */
function serializeJSONObject(
  value: object,
  indent: string,
  reserved: number,
  state: State,
): string {
  if (state.stack.includes(value)) {
    throw new TypeError("Converting circular structure to JSON");
  }
  state.stack.push(value);

  const childIndent = indent + state.gap;
  const separator = state.gap ? ": " : ":";
  const keys = orderedKeys(value, state);
  const partial: string[] = [];

  for (const [i, key] of keys.entries()) {
    const prefix = quoteJSONString(key) + separator;
    const comma = i < keys.length - 1 ? 1 : 0;
    const member = serializeJSONProperty(
      key,
      value,
      childIndent,
      childIndent.length + prefix.length + comma,
      state,
    );
    if (member !== undefined) partial.push(prefix + member);
  }

  state.stack.pop();
  return wrap(partial, false, indent, reserved, state);
}

/** §25.5.4.2 SerializeJSONProperty */
function serializeJSONProperty(
  key: string,
  holder: object,
  indent: string,
  reserved: number,
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
        ? serializeJSONArray(value, indent, reserved, state)
        : serializeJSONObject(value, indent, reserved, state);
    }

    default:
      // undefined, function, symbol: no JSON representation.
      return undefined;
  }
}

/**
 * An options object is a *plain* object; a replacer is only ever a function, an
 * array, or nullish. That keeps the two forms of the call unambiguous.
 *
 * The plainness matters: `new Date()` is a malformed replacer, not an options
 * object, and has to reach the replacer check to be rejected rather than
 * silently switching the call onto the options defaults.
 */
function isOptions(value: Replacer | Options | undefined): value is Options {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** `Options` with every key explicitly present, possibly as `undefined`. */
type GivenOptions = { [K in keyof Options]: Options[K] | undefined };

function toState(options: GivenOptions): State {
  const { replacer, space, maxWidth, sortKeys, arrayPadding, objectPadding } = options;

  if (replacer != null && typeof replacer !== "function" && !Array.isArray(replacer)) {
    throw new Error("beautify: replacer must be a function or an array");
  }
  // `Infinity` is allowed and means "never break"; negative widths would only
  // be an obscure spelling of 0, which already means "always break".
  if (maxWidth !== undefined && (typeof maxWidth !== "number" || !(maxWidth >= 0))) {
    throw new Error("beautify: maxWidth must be a number >= 0");
  }
  if (sortKeys !== undefined && typeof sortKeys !== "boolean" && typeof sortKeys !== "function") {
    throw new Error("beautify: sortKeys must be a boolean or a comparator function");
  }
  for (const [name, padding] of [
    ["arrayPadding", arrayPadding],
    ["objectPadding", objectPadding],
  ] as const) {
    if (padding !== undefined && (typeof padding !== "string" || padding.trim() !== "")) {
      throw new Error(`beautify: ${name} must be a string of whitespace`);
    }
  }

  return {
    replacerFunction: typeof replacer === "function" ? replacer : undefined,
    propertyList: Array.isArray(replacer) ? toPropertyList(replacer) : undefined,
    gap: toGap(space),
    stack: [],
    maxWidth: maxWidth ?? 0,
    sortKeys: sortKeys ?? false,
    arrayPadding: arrayPadding ?? " ",
    objectPadding: objectPadding ?? " ",
  };
}

/**
 * Serialize `value` as JSON, keeping objects and arrays on one line while they
 * fit within `maxWidth` characters.
 *
 * Called with an options object, `space` defaults to 2 and `maxWidth` to 80 —
 * the point of the call is to get readable output. Called with the positional
 * `JSON.stringify` arguments, both default to off, so the result is
 * character-identical to `JSON.stringify` for every input it accepts.
 *
 * It is stricter than `JSON.stringify` about arguments: a malformed replacer,
 * width or option name throws rather than being silently ignored.
 *
 * @throws {Error} on a malformed argument or an unknown option.
 * @throws {TypeError} on a BigInt value or a circular structure, per §25.5.4.
 */
export default function beautify(value: unknown, options?: Options): string;
export default function beautify(
  value: unknown,
  replacer?: Replacer,
  space?: number | string,
  maxWidth?: number,
): string;
export default function beautify(
  value: unknown,
  replacerOrOptions?: Replacer | Options,
  space?: number | string,
  maxWidth?: number,
): string {
  let options: GivenOptions;

  if (isOptions(replacerOrOptions)) {
    if (space !== undefined || maxWidth !== undefined) {
      throw new Error("beautify: pass an options object or positional arguments, not both");
    }
    for (const key of Object.keys(replacerOrOptions)) {
      if (!OPTION_KEYS.includes(key as keyof Options)) {
        throw new Error(`beautify: unknown option ${JSON.stringify(key)}`);
      }
    }
    // The options form exists to produce readable output, so it defaults to it.
    options = { space: 2, maxWidth: 80, ...replacerOrOptions };
  } else {
    options = { replacer: replacerOrOptions ?? null, space, maxWidth };
  }

  return serializeJSONProperty("", { "": value }, "", 0, toState(options)) as string;
}
