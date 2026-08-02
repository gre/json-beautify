import assert from "node:assert/strict";
import { test } from "node:test";
import beautify from "./index.js";

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
  assert.throws(() => beautify({}, "nope" as never, 2), /wrong replacer/);
});

test("rejects a non-numeric limit", () => {
  assert.throws(() => beautify({}, null, 2, "nope" as never), /limit must be a number/);
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

test("replacer array ignores non-string entries", () => {
  const out = beautify({ a: 1, 0: "zero", b: 2 }, ["a", 0 as unknown as string], 2);
  assert.deepEqual(JSON.parse(out), { a: 1 });
});

test("escapes non-meta control characters as a \\u00XX sequence", () => {
  const s = "a" + String.fromCharCode(0x01) + "b";
  const out = beautify({ s }, null, 2);
  assert.ok(out.includes("\\u0001"));
  assert.deepEqual(JSON.parse(out), { s });
});

test("escapes unicode line and paragraph separators", () => {
  const s = "a" + String.fromCharCode(0x2028) + "b" + String.fromCharCode(0x2029) + "c";
  const out = beautify({ s }, null, 2);
  assert.ok(out.includes("\\u2028") && out.includes("\\u2029"));
  assert.deepEqual(JSON.parse(out), { s });
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

test("wrap boundary: fits inline exactly at the limit, breaks one char under", () => {
  assert.equal(beautify([1, 2, 3], null, 2, 13), "[ 1, 2, 3 ]");
  assert.equal(beautify([1, 2, 3], null, 2, 12), "[\n  1,\n  2,\n  3\n]");
});

test("only the branch that exceeds the limit wraps, siblings stay inline", () => {
  const out = beautify({ small: [1, 2], big: [100000, 200000, 300000, 400000] }, null, 2, 30);
  assert.equal(
    out,
    '{\n  "small": [ 1, 2 ],\n  "big": [\n    100000,\n    200000,\n    300000,\n    400000\n  ]\n}',
  );
});
