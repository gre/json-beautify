json-beautify
=============

JSON.stringify for humans

**json-beautify** is a TypeScript implementation of [ECMA-262 §25.5.4](https://tc39.es/ecma262/#sec-json.stringify), the specification of `JSON.stringify`, with one addition: objects and arrays stay on a single line for as long as they fit within a width you choose, and only break when they have to.

For every value, replacer and space it accepts, the positional form produces character-identical output to `JSON.stringify` — boxed primitives, `toJSON`, replacer arrays, `space` clamping, lone-surrogate escaping, `TypeError` on BigInt and on circular structures, and [`JSON.rawJSON`](https://github.com/tc39/proposal-json-parse-with-source) (Node 22+) all behave as the spec requires.

## Install

```sh
npm install json-beautify
```

## Usage

```js
import beautify from "json-beautify";

const obj = {
  str: "Hello World",
  num: 42,
  smallarray: [1, 2, 3, "foo", {}],
  smallobject: { foo: "bar", bar: 42 },
  bigarray: [1, 2, 3, "foo", { foo: "bar", bar: 42, arr: [1, 2, 3, "foo", {}] }],
  bigobject: { foo: [1, 2, 3, "foo", {}], bar: 42, a: { b: { c: 42 } }, foobar: "FooBar" },
};

console.log(beautify(obj, {}));
```

```json
{
  "str": "Hello World",
  "num": 42,
  "smallarray": [ 1, 2, 3, "foo", {} ],
  "smallobject": { "foo": "bar", "bar": 42 },
  "bigarray": [
    1,
    2,
    3,
    "foo",
    { "foo": "bar", "bar": 42, "arr": [ 1, 2, 3, "foo", {} ] }
  ],
  "bigobject": {
    "foo": [ 1, 2, 3, "foo", {} ],
    "bar": 42,
    "a": { "b": { "c": 42 } },
    "foobar": "FooBar"
  }
}
```

Widen it and more stays inline:

```js
console.log(beautify(obj, { maxWidth: 100 }));
```

```json
{
  "str": "Hello World",
  "num": 42,
  "smallarray": [ 1, 2, 3, "foo", {} ],
  "smallobject": { "foo": "bar", "bar": 42 },
  "bigarray": [ 1, 2, 3, "foo", { "foo": "bar", "bar": 42, "arr": [ 1, 2, 3, "foo", {} ] } ],
  "bigobject": {
    "foo": [ 1, 2, 3, "foo", {} ],
    "bar": 42,
    "a": { "b": { "c": 42 } },
    "foobar": "FooBar"
  }
}
```

## Options

| Option | Type | Default | |
| --- | --- | --- | --- |
| `replacer` | function \| array \| null | `null` | §25.5.4 `replacer`: a filter function, or an array of keys to keep. |
| `space` | number \| string | `2` | §25.5.4 `space`: indent width, or the literal indent string. |
| `maxWidth` | number | `80` | Maximum line width. `0` always breaks, `Infinity` never does. |
| `sortKeys` | boolean \| comparator | `false` | Sort object keys instead of using their natural order. |
| `arrayPadding` | string | `" "` | Padding inside a single-line array. `""` gives `[1, 2]`. |
| `objectPadding` | string | `" "` | Padding inside a single-line object. `""` gives `{"a": 1}`. |

An unknown option name throws, so a typo like `maxwidth` is caught rather than silently ignored.

### `sortKeys`

```js
console.log(beautify({ z: 1, a: { d: 1, b: 2 } }, { sortKeys: true }));
// { "a": { "b": 2, "d": 1 }, "z": 1 }
```

Pass a comparator for a custom order:

```js
beautify(value, { sortKeys: (a, b) => a.length - b.length });
```

A `replacer` array is itself an explicit ordering, so `sortKeys` leaves it alone.

### Padding

```js
beautify({ a: [1, 2] }, {});                                  // { "a": [ 1, 2 ] }
beautify({ a: [1, 2] }, { arrayPadding: "" });                 // { "a": [1, 2] }
beautify({ a: [1, 2] }, { arrayPadding: "", objectPadding: "" }); // {"a": [1, 2]}
```

### `maxWidth` is a bound, not an estimate

The width accounts for the indent, the `"key": ` prefix the value sits behind, and the comma that follows it. No line exceeds `maxWidth` unless it holds a single value too long to break — a long string, or a key wider than the budget.

## `JSON.stringify` compatibility

The positional signature is still supported, and is a drop-in replacement:

```js
beautify(value, replacer, space, maxWidth);
```

Called this way, `space` and `maxWidth` default to off rather than to `2` and `80`, so `beautify(value, replacer, space)` is exactly `JSON.stringify(value, replacer, space)`. The options form is the front door and defaults to readable output; the positional form is the compatibility path.

It is stricter than `JSON.stringify` about arguments: a malformed replacer, width or option name throws instead of being silently ignored. This affects argument validation only, never how an accepted value is serialized.

## CLI

```sh
npx json-beautify [options] <file...>
```

Rewrites each file in place.

```
-w, --width <n>       maximum line width (default 80)
-i, --indent <n|str>  indent width, or the literal indent string (default 2)
-s, --sort-keys       sort object keys
-c, --compact         no padding inside single-line arrays and objects
-h, --help            show this message
```

## Development

```sh
npm install
npm run build      # compile TypeScript to dist/
npm test           # compile + run the test suite (node:test)
npm run typecheck  # type-check only, no emit
npm run lint       # oxlint
npm run fmt        # oxfmt (use fmt:check in CI)
```
