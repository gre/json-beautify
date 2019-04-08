#!/usr/bin/env node

var beautify = require(".");
var fs = require('fs');
var assert = require('assert');

var obj = { str: "Hello World", num: 42, smallarray: [ 1, 2, 3, "foo", {} ], smallobject: { foo: "bar", bar: 42 }, bigarray: [ 1, 2, 3, "foo", { foo: "bar", bar: 42, arr: [ 1, 2, 3, "foo", {} ] } ], bigobject: { foo: [ 1, 2, 3, "foo", {} ], bar: 42, a: {b: { c: 42 }}, foobar: "FooBar" } };

var readmeArray = fs.readFileSync('README.md', 'utf-8').split('\n');

const STATE_NONE = 0;
const STATE_CODE = 1;
const STATE_JSON = 2;

var state = 0;
var currentOutput = "";
var currentCode = [];

for (line of readmeArray) {
  switch (state) {
    case STATE_NONE:
      if (line == '```js') {
        state = STATE_CODE;
      }
      if (line == '```json') {
        state = STATE_JSON;
      }
      break;
    case STATE_CODE:
      if (line == '```') {
        state = STATE_NONE;
      } else {
        var matches = line.match(/console.log\((.*)\)/);

        if (matches) {
          currentCode.push(matches[1]);
        }
      }
      break;
    case STATE_JSON:
      if (line == '```') {
        // Check data
        for (i of currentCode) {
          console.log('Testing: ' + i);
          assert.strictEqual(currentOutput, eval(i) + '\n');
          assert.deepEqual(obj, JSON.parse(currentOutput));
        }

        currentOutput = "";
        currentCode = [];
        state = STATE_NONE;
      } else {
        currentOutput += line + '\n';
      }
      break;
  }
}

console.log('Done');
