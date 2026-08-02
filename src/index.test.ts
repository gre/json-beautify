import assert from "node:assert/strict";
import { test } from "node:test";
import beautify, { type Replacer } from "./index.js";

const sample = {
  str: "Hello World",
  num: 42,
  smallarray: [1, 2, 3, "foo", {}],
  smallobject: { foo: "bar", bar: 42 },
  bigarray: [1, 2, 3, "foo", { foo: "bar", bar: 42, arr: [1, 2, 3, "foo", {}] }],
  bigobject: { foo: [1, 2, 3, "foo", {}], bar: 42, a: { b: { c: 42 } }, foobar: "FooBar" },
};

test("matches JSON.stringify when no limit is set", () => {
  assert.equal(
    beautify({ a: 1, b: [1, 2, 3] }, null, 2),
    JSON.stringify({ a: 1, b: [1, 2, 3] }, null, 2),
  );
});

test("keeps small values inline and breaks large ones onto multiple lines", () => {
  const out = beautify(sample, null, 2, 80);
  for (const line of out.split("\n")) {
    assert.ok(line.length <= 80, `line exceeds 80 chars: ${line}`);
  }
  assert.deepEqual(JSON.parse(out), sample);
});

test("wider limit keeps more content inline", () => {
  const out100 = beautify(sample, null, 2, 100);
  const out80 = beautify(sample, null, 2, 80);
  assert.ok(out100.split("\n").length <= out80.split("\n").length);
  assert.deepEqual(JSON.parse(out100), sample);
});

test("no space parameter produces compact single-line output, ignoring limit", () => {
  assert.equal(beautify({ a: 1, b: [1, 2] }, null, undefined, 80), '{"a":1,"b":[1,2]}');
});

test("supports a replacer function", () => {
  const out = beautify(
    { a: 1, b: 2 },
    (_key, value) => (typeof value === "number" ? value * 2 : value),
    2,
  );
  assert.deepEqual(JSON.parse(out), { a: 2, b: 4 });
});

test("supports a replacer allowlist array", () => {
  const out = beautify({ a: 1, b: 2, c: 3 }, ["a", "c"], 2);
  assert.deepEqual(JSON.parse(out), { a: 1, c: 3 });
});

test("supports toJSON", () => {
  const value = { toJSON: () => ({ x: 1 }) };
  assert.equal(beautify(value, null, 2), beautify({ x: 1 }, null, 2));
});

test("escapes control and quote characters", () => {
  const out = beautify({ s: 'a"b\nc\\d' }, null, 2);
  assert.deepEqual(JSON.parse(out), { s: 'a"b\nc\\d' });
});

test("empty arrays and objects", () => {
  assert.equal(beautify([], null, 2), "[]");
  assert.equal(beautify({}, null, 2), "{}");
});

test("non-finite numbers become null, matching JSON.stringify", () => {
  assert.equal(
    beautify({ a: Infinity, b: NaN }, null, 2),
    JSON.stringify({ a: Infinity, b: NaN }, null, 2),
  );
});

test("rejects an invalid replacer", () => {
  assert.throws(() => beautify({}, "nope" as never, 2), /replacer must be a function or an array/);
});

test("rejects a non-numeric maxWidth", () => {
  assert.throws(() => beautify({}, null, 2, "nope" as never), /maxWidth must be a number/);
  assert.throws(() => beautify({}, { maxWidth: NaN }), /maxWidth must be a number/);
});

test("supports a string indent", () => {
  const tab = String.fromCharCode(9);
  assert.equal(beautify({ a: 1, b: 2 }, null, tab), `{\n${tab}"a": 1,\n${tab}"b": 2\n}`);
});

test("treats a negative space as no indent", () => {
  assert.equal(beautify({ a: 1 }, null, -3), '{"a":1}');
});

test("floors a fractional space", () => {
  assert.equal(beautify({ a: 1 }, null, 2.9), beautify({ a: 1 }, null, 2));
});

test("omits object properties whose value is undefined", () => {
  const out = beautify({ a: 1, b: undefined, c: 3 }, null, 2);
  assert.deepEqual(JSON.parse(out), { a: 1, c: 3 });
  assert.ok(!out.includes('"b"'));
});

test("replacer function can drop a property by returning undefined", () => {
  const out = beautify({ a: 1, b: 2 }, (_key, value) => (value === 2 ? undefined : value), 2);
  assert.deepEqual(JSON.parse(out), { a: 1 });
});

test("replacer function is called with the holder as `this`", () => {
  const holders: unknown[] = [];
  beautify(
    { a: 1 },
    function (_key, value) {
      holders.push(this);
      return value;
    },
    2,
  );
  assert.deepEqual(holders[1], { a: 1 });
});

test("replacer function is applied to array elements", () => {
  const out = beautify(
    [1, 2, 3],
    (_key, value) => (typeof value === "number" ? value * 10 : value),
    2,
  );
  assert.deepEqual(JSON.parse(out), [10, 20, 30]);
});

test("replacer array coerces numeric entries to keys", () => {
  // PropertyList order, not object insertion order.
  const out = beautify({ a: 1, 0: "zero", b: 2 }, ["a", 0], 2);
  assert.equal(out, JSON.stringify({ a: 1, 0: "zero", b: 2 }, ["a", 0], 2));
  assert.deepEqual(JSON.parse(out), { a: 1, 0: "zero" });
});

test("replacer array de-duplicates keys", () => {
  assert.equal(beautify({ a: 1 }, ["a", "a"], 2), '{\n  "a": 1\n}');
});

test("replacer array unwraps boxed String/Number entries", () => {
  const boxed = [new String("a"), new Number(0)] as unknown as string[];
  assert.deepEqual(JSON.parse(beautify({ a: 1, 0: "zero", b: 2 }, boxed, 2)), { a: 1, 0: "zero" });
});

test("escapes non-meta control characters as a \\u00XX sequence", () => {
  const s = "a" + String.fromCharCode(0x01) + "b";
  const out = beautify({ s }, null, 2);
  assert.ok(out.includes("\\u0001"));
  assert.deepEqual(JSON.parse(out), { s });
});

test("passes U+2028/U+2029 through raw, like JSON.stringify", () => {
  // ES2019's JSON superset made these legal unescaped; only json2.js escaped
  // them, to keep output safe to paste inside a <script> tag.
  const s = "a" + String.fromCharCode(0x2028) + "b" + String.fromCharCode(0x2029) + "c";
  const out = beautify({ s }, null, 2);
  assert.equal(out, JSON.stringify({ s }, null, 2));
  assert.ok(!out.includes("\\u2028"));
  assert.deepEqual(JSON.parse(out), { s });
});

test("escapes lone surrogates but leaves well-formed pairs alone", () => {
  const lone = "a" + String.fromCharCode(0xd800) + "b" + String.fromCharCode(0xdc00);
  const out = beautify({ lone }, null, 2);
  assert.equal(out, JSON.stringify({ lone }, null, 2));
  assert.ok(out.includes("\\ud800") && out.includes("\\udc00"));

  const emoji = String.fromCodePoint(0x1f600);
  assert.equal(beautify({ emoji }, null, 2), JSON.stringify({ emoji }, null, 2));
  assert.ok(!beautify({ emoji }, null, 2).includes("\\u"));
});

test("does not escape characters the spec leaves alone", () => {
  // json2.js escaped all of these; JSON.stringify never has.
  for (const code of [0x007f, 0x00ad, 0x0600, 0x200c, 0x2060, 0xfeff]) {
    const s = String.fromCharCode(code);
    assert.equal(beautify({ s }, null, 2), JSON.stringify({ s }, null, 2));
  }
});

test("unwraps boxed primitives", () => {
  const value = { n: new Number(5), s: new String("x"), b: new Boolean(true) };
  assert.equal(beautify(value, null, 2), JSON.stringify(value, null, 2));
  assert.deepEqual(JSON.parse(beautify(value, null, 2)), { n: 5, s: "x", b: true });
});

test("throws a TypeError on BigInt", () => {
  assert.throws(() => beautify({ a: 1n }, null, 2), TypeError);
  assert.throws(() => beautify(Object(1n), null, 2), TypeError);
});

test("honours a user-installed BigInt.prototype.toJSON", () => {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value(this: bigint) {
      return String(this);
    },
    configurable: true,
  });
  try {
    assert.equal(beautify({ a: 1n }, null, 2), JSON.stringify({ a: 1n }, null, 2));
    assert.deepEqual(JSON.parse(beautify({ a: 1n }, null, 2)), { a: "1" });
  } finally {
    delete (BigInt.prototype as { toJSON?: unknown }).toJSON;
  }
});

test("throws a TypeError on circular structures", () => {
  const obj: Record<string, unknown> = {};
  obj["self"] = obj;
  assert.throws(() => beautify(obj, null, 2), TypeError);

  const arr: unknown[] = [];
  arr.push(arr);
  assert.throws(() => beautify(arr, null, 2), TypeError);

  const deep = { a: { b: {} as Record<string, unknown> } };
  deep.a.b["root"] = deep;
  assert.throws(() => beautify(deep, null, 2), TypeError);
});

test("allows shared but acyclic references", () => {
  // The cycle check tracks ancestors, not everything already visited.
  const shared = { x: 1 };
  const value = { a: shared, b: shared, c: [shared, shared] };
  assert.equal(beautify(value, null, 2), JSON.stringify(value, null, 2));
});

test("clamps a numeric space to 10", () => {
  for (const space of [20, Infinity, 10.9]) {
    assert.equal(beautify({ a: 1 }, null, space), JSON.stringify({ a: 1 }, null, space));
  }
  assert.equal(beautify({ a: 1 }, null, 20), "{\n" + " ".repeat(10) + '"a": 1\n}');
});

test("truncates a string space to 10 characters", () => {
  const space = "0123456789ABCDEF";
  assert.equal(beautify({ a: 1 }, null, space), JSON.stringify({ a: 1 }, null, space));
  assert.equal(beautify({ a: 1 }, null, space), '{\n0123456789"a": 1\n}');
});

test("unwraps a boxed space", () => {
  const boxedNumber = new Number(2) as unknown as number;
  const boxedString = new String("__") as unknown as string;
  assert.equal(beautify({ a: 1 }, null, boxedNumber), '{\n  "a": 1\n}');
  assert.equal(beautify({ a: 1 }, null, boxedString), '{\n__"a": 1\n}');
});

test("honours toJSON on a callable value", () => {
  const fn = Object.assign(() => {}, { toJSON: () => 42 });
  assert.equal(beautify({ a: fn }, null, 2), JSON.stringify({ a: fn }, null, 2));
  assert.deepEqual(JSON.parse(beautify({ a: fn }, null, 2)), { a: 42 });
});

test("splices JSON.rawJSON in verbatim", (t) => {
  // Node 22+; the implementation feature-detects, so skip where it is absent.
  const json = JSON as {
    isRawJSON?: (value: unknown) => boolean;
    rawJSON?: (text: string) => object;
  };
  if (typeof json.isRawJSON !== "function" || typeof json.rawJSON !== "function") {
    return t.skip("JSON.rawJSON unavailable");
  }
  const value = { big: json.rawJSON("999999999999999999") };
  assert.equal(beautify(value, null, 2), JSON.stringify(value, null, 2));
  assert.ok(beautify(value, null, 2).includes("999999999999999999"));
});

test("keeps insertion order of object keys", () => {
  const out = beautify({ z: 1, a: 2, m: 3 }, null, 2);
  assert.deepEqual(
    out.match(/"z"|"a"|"m"/g),
    ["z", "a", "m"].map((k) => `"${k}"`),
  );
});

test("supports Date via its built-in toJSON", () => {
  const date = new Date("2020-01-01T00:00:00.000Z");
  assert.equal(beautify({ d: date }, null, 2), beautify({ d: date.toJSON() }, null, 2));
});

test("array values that are undefined/functions become null", () => {
  const out = beautify([1, undefined, () => {}, 2], null, 2);
  assert.deepEqual(JSON.parse(out), [1, null, null, 2]);
});

test("wrap boundary: fits at exactly its own width, breaks one char under", () => {
  // "[ 1, 2, 3 ]" is 11 characters, so 11 is the exact threshold.
  assert.equal(beautify([1, 2, 3], null, 2, 11).length, 11);
  assert.equal(beautify([1, 2, 3], null, 2, 11), "[ 1, 2, 3 ]");
  assert.equal(beautify([1, 2, 3], null, 2, 10), "[\n  1,\n  2,\n  3\n]");
});

test("only the branch that exceeds the limit wraps, siblings stay inline", () => {
  const out = beautify({ small: [1, 2], big: [100000, 200000, 300000, 400000] }, null, 2, 30);
  assert.equal(
    out,
    '{\n  "small": [ 1, 2 ],\n  "big": [\n    100000,\n    200000,\n    300000,\n    400000\n  ]\n}',
  );
});

// The core contract: with no `limit`, beautify is JSON.stringify. Anything
// that drifts from §25.5.4 shows up here even if no named test covers it.
test("matches JSON.stringify exactly across the spec's edge cases", () => {
  const surrogate = String.fromCharCode(0xd800);
  const cases: Array<[unknown, Replacer, number | string | undefined]> = [
    // Boxed primitives (§25.5.4.2 step 4.b-d).
    [{ n: new Number(5), s: new String("x"), b: new Boolean(false) }, null, 2],
    [[new Number(0), new String("")], null, 2],
    // space normalization (§25.5.4 steps 6-9).
    [{ a: 1 }, null, 20],
    [{ a: 1 }, null, Infinity],
    [{ a: 1 }, null, -2],
    [{ a: 1 }, null, NaN],
    [{ a: 1 }, null, 0],
    [{ a: 1 }, null, 10],
    [{ a: 1 }, null, "0123456789ABCDEF"],
    [{ a: 1 }, null, ""],
    [{ a: 1 }, null, new Number(2) as unknown as number],
    [{ a: 1 }, null, new String("__") as unknown as string],
    // PropertyList (§25.5.4 step 5.b.ii).
    [{ 1: "a", b: "c" }, [1], 2],
    [{ a: 1, b: 2 }, ["a", "a", "b"], 2],
    [{ a: 1, b: 2 }, [new String("a")] as unknown as string[], 2],
    [{ a: 1, b: 2 }, [true, null, {}] as unknown as string[], 2],
    [{ a: [{ a: 1, b: 2 }] }, ["a"], 2],
    // QuoteJSONString (§25.5.4.3).
    [{ s: surrogate + "x" + String.fromCharCode(0xdc00) }, null, 2],
    [{ s: String.fromCodePoint(0x1f600) }, null, 2],
    [
      {
        s: [0x2028, 0x2029, 0x007f, 0x00ad, 0xfeff, 0x200c]
          .map((c) => String.fromCharCode(c))
          .join(""),
      },
      null,
      2,
    ],
    [
      {
        s: [0x22, 0x5c, 0x0a, 0x09, 0x08, 0x0c, 0x0d, 0x01, 0x1f]
          .map((c) => String.fromCharCode(c))
          .join(""),
      },
      null,
      2,
    ],
    [{ [surrogate]: 1 }, null, 2],
    // toJSON (§25.5.4.2 step 2).
    [{ f: Object.assign(() => {}, { toJSON: () => 42 }) }, null, 2],
    [{ d: new Date("2020-01-01T00:00:00.000Z") }, null, 2],
    // Assorted.
    [{ a: undefined, b: Symbol("s"), c: () => {}, d: 1 }, null, 2],
    [[undefined, Symbol("s"), () => {}, 1], null, 2],
    [{ a: Infinity, b: NaN, c: -0 }, null, 2],
    [Object.create(null) as object, null, 2],
    [{ z: 1, 2: "two", a: 3, 1: "one" }, null, 2],
  ];

  for (const [value, replacer, space] of cases) {
    assert.equal(
      beautify(value, replacer, space),
      JSON.stringify(value, replacer as never, space),
      `mismatch for ${JSON.stringify(String(space))} / ${String(replacer)}`,
    );
  }
});

// --- Options object -------------------------------------------------------

test("options form defaults to a 2-space indent and an 80-column width", () => {
  assert.equal(beautify(sample, {}), beautify(sample, null, 2, 80));
});

test("options form accepts every positional argument by name", () => {
  assert.equal(
    beautify(sample, { replacer: null, space: 4, maxWidth: 60 }),
    beautify(sample, null, 4, 60),
  );
  assert.equal(
    beautify({ a: 1, b: 2 }, { replacer: ["a"] }),
    beautify({ a: 1, b: 2 }, ["a"], 2, 80),
  );
});

test("options form is distinguished from a replacer without ambiguity", () => {
  // Functions and arrays are replacers; any other object is options.
  assert.equal(beautify({ a: 1, b: 2 }, ["a"]), '{"a":1}');
  assert.equal(beautify({ a: 1 }, { space: 0 }), '{"a":1}');
});

test("rejects an unknown option, catching typos JSON.stringify would swallow", () => {
  assert.throws(() => beautify({}, { maxwidth: 100 } as never), /unknown option "maxwidth"/);
  assert.throws(() => beautify({}, { sortkeys: true } as never), /unknown option "sortkeys"/);
});

test("rejects mixing the options object with positional arguments", () => {
  assert.throws(() => beautify({}, { space: 2 } as never, 4), /not both/);
});

test("validates option types", () => {
  assert.throws(() => beautify({}, { sortKeys: "yes" as never }), /sortKeys must be/);
  assert.throws(() => beautify({}, { arrayPadding: "x" }), /arrayPadding must be a string/);
  assert.throws(
    () => beautify({}, { objectPadding: 3 as never }),
    /objectPadding must be a string/,
  );
  assert.throws(() => beautify({}, { replacer: "nope" as never }), /replacer must be/);
});

// --- sortKeys -------------------------------------------------------------

test("sortKeys orders object keys, recursively", () => {
  const value = { z: 1, a: { d: 1, b: 2 }, m: [{ y: 1, x: 2 }] };
  const out = beautify(value, { sortKeys: true });
  assert.deepEqual(out.match(/"[a-z]"(?=:)/g), ['"a"', '"b"', '"d"', '"m"', '"x"', '"y"', '"z"']);
  assert.deepEqual(JSON.parse(out), value);
});

test("sortKeys sorts keys, not their serialized text", () => {
  // Sorting the rendered `"key": value` members instead would interleave the
  // quote and colon with key characters and produce a different order.
  const value = { ab: 1, "a b": 2, "a!": 3, a: 4 };
  const out = beautify(value, { sortKeys: true });
  assert.deepEqual(Object.keys(JSON.parse(out)), ["a", "a b", "a!", "ab"]);
});

test("sortKeys accepts a comparator", () => {
  const value = { bb: 1, a: 2, cccc: 3 };
  const byLength = (a: string, b: string) => a.length - b.length;
  assert.deepEqual(Object.keys(JSON.parse(beautify(value, { sortKeys: byLength }))), [
    "a",
    "bb",
    "cccc",
  ]);
});

test("a replacer array keeps its own order, overriding sortKeys", () => {
  // The array is itself an explicit ordering; sorting it would discard intent.
  const out = beautify({ a: 1, b: 2, c: 3 }, { replacer: ["c", "a"], sortKeys: true });
  assert.deepEqual(Object.keys(JSON.parse(out)), ["c", "a"]);
});

test("sortKeys is off by default, preserving insertion order", () => {
  assert.deepEqual(Object.keys(JSON.parse(beautify({ z: 1, a: 2 }, {}))), ["z", "a"]);
});

// --- Padding --------------------------------------------------------------

test("padding controls the space inside single-line arrays and objects", () => {
  const value = { a: [1, 2] };
  assert.equal(beautify(value, {}), '{ "a": [ 1, 2 ] }');
  assert.equal(beautify(value, { arrayPadding: "" }), '{ "a": [1, 2] }');
  assert.equal(beautify(value, { objectPadding: "" }), '{"a": [ 1, 2 ]}');
  assert.equal(beautify(value, { arrayPadding: "", objectPadding: "" }), '{"a": [1, 2]}');
});

test("padding is counted against maxWidth", () => {
  assert.equal(beautify([1, 2, 3], { maxWidth: 10, arrayPadding: "" }), "[1, 2, 3]");
  assert.equal(beautify([1, 2, 3], { maxWidth: 10 }), "[\n  1,\n  2,\n  3\n]");
});

test("padding does not apply to compact output, keeping JSON.stringify parity", () => {
  const value = { a: [1, 2] };
  assert.equal(beautify(value, { space: 0, arrayPadding: "" }), JSON.stringify(value));
  assert.equal(beautify(value, { space: 0 }), JSON.stringify(value));
});

// --- maxWidth is a real bound ---------------------------------------------

test("no line exceeds maxWidth when the content can be broken at all", () => {
  // Budget so no atom can ever be the cause: depth <= 5 gives indent <= 10,
  // the longest key prefix is 9 (`"abcde": `), the longest atom 8, comma 1.
  // 10 + 9 + 8 + 1 = 28, comfortably under the 40 used below.
  let seed = 0x2f6e2b1;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const keys = ["id", "ab", "abc", "abcd", "abcde"];
  const atoms = [1, 42, "sixchr", true, null, 1234];
  const gen = (d: number): unknown => {
    if (d <= 0 || rnd(3) === 0) return atoms[rnd(atoms.length)];
    if (rnd(2)) return Array.from({ length: rnd(4) + 1 }, () => gen(d - 1));
    const o: Record<string, unknown> = {};
    for (let i = rnd(4) + 1; i--;) o[keys[rnd(keys.length)] as string] = gen(d - 1);
    return o;
  };

  const width = 40;
  for (let i = 0; i < 2000; i += 1) {
    const value = gen(5);
    const out = beautify(value, { maxWidth: width });
    for (const line of out.split("\n")) {
      assert.ok(line.length <= width, `line of ${line.length} > ${width}:\n${out}`);
    }
    assert.deepEqual(JSON.parse(out), JSON.parse(JSON.stringify(value)));
  }
});

test("counts the key prefix, so a long key cannot push a value past maxWidth", () => {
  const value = { aLongDescriptiveKeyName: [100, 200, 300] };
  const out = beautify(value, { maxWidth: 40 });
  for (const line of out.split("\n")) assert.ok(line.length <= 40, line);
  assert.ok(out.includes("\n    100,"));
});

test("counts the trailing comma", () => {
  const value = { a: [1, 2], b: 0 };
  const out = beautify(value, { maxWidth: 15, space: 2 });
  for (const line of out.split("\n")) assert.ok(line.length <= 15, `${line.length}: ${line}`);
});

test("a member that already broke is never folded back onto one line", () => {
  const out = beautify({ outer: { inner: [1, 2, 3, 4, 5, 6, 7, 8] } }, { maxWidth: 20 });
  for (const line of out.split("\n")) assert.ok(!line.includes("[\n"), line);
  assert.deepEqual(JSON.parse(out), { outer: { inner: [1, 2, 3, 4, 5, 6, 7, 8] } });
});
