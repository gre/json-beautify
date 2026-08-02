json-beautify
=============

JSON.stringify with fixed maximum character width.

**json-beautify** is a TypeScript implementation of [ECMA-262 §25.5.4](https://tc39.es/ecma262/#sec-json.stringify), the specification of `JSON.stringify`. Given the same arguments it produces character-identical output — boxed primitives, `toJSON`, replacer arrays, `space` clamping, lone-surrogate escaping, `TypeError` on BigInt and on circular structures, and [`JSON.rawJSON`](https://github.com/tc39/proposal-json-parse-with-source) (Node 22+) all behave as the spec requires.

It adds one thing `JSON.stringify` has no equivalent for: an optional 4th parameter, the maximum line width (for instance 80). Objects and arrays stay on a single line until their inline form would exceed it.

## Install

```sh
npm install json-beautify
```

## Examples:

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
```

### With 100 fixed-spaces:

```js
console.log(beautify(obj, null, 2, 100));
```

```json
{
  "str": "Hello World",
  "num": 42,
  "smallarray": [ 1, 2, 3, "foo", {} ],
  "smallobject": { "foo": "bar", "bar": 42 },
  "bigarray": [ 1, 2, 3, "foo", { "foo": "bar", "bar": 42, "arr": [ 1, 2, 3, "foo", {} ] } ],
  "bigobject": { "foo": [ 1, 2, 3, "foo", {} ], "bar": 42, "a": { "b": { "c": 42 } }, "foobar": "FooBar" }
}
```

### With 80 fixed-spaces:

```js
console.log(beautify(obj, null, 2, 80));
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

## CLI

```sh
npx json-beautify file1.json file2.json
```

Rewrites each file in place, beautified with a 2-space indent and an 80-character width limit.

## Development

```sh
npm install
npm run build      # compile TypeScript to dist/
npm test           # compile + run the test suite (node:test)
npm run typecheck  # type-check only, no emit
npm run lint        # oxlint
npm run fmt         # oxfmt (use fmt:check in CI)
```
