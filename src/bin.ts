#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import beautify, { type Options } from "./index.js";

const USAGE = `Usage: json-beautify [options] <file...>

Rewrites each JSON file in place.

Options:
  -w, --width <n>       maximum line width (default 80)
  -i, --indent <n|str>  indent width, or the literal indent string (default 2)
  -s, --sort-keys       sort object keys
  -c, --compact         no padding inside single-line arrays and objects
  -h, --help            show this message
`;

function fail(message: string): never {
  process.stderr.write(`json-beautify: ${message}\n\n${USAGE}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const files: string[] = [];
const options: Options = {};

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i] as string;

  if (arg === "--") {
    files.push(...argv.slice(i + 1));
    break;
  }
  if (!arg.startsWith("-") || arg === "-") {
    files.push(arg);
    continue;
  }

  // Accept both `--width 80` and `--width=80`.
  const equals = arg.indexOf("=");
  const name = equals === -1 ? arg : arg.slice(0, equals);
  const attached = equals === -1 ? undefined : arg.slice(equals + 1);
  const value = (): string => {
    const given = attached ?? argv[(i += 1)];
    if (given === undefined) fail(`${name} needs a value`);
    return given;
  };

  switch (name) {
    case "-h":
    case "--help":
      process.stdout.write(USAGE);
      process.exit(0);
      break;

    case "-w":
    case "--width": {
      const given = value();
      const width = Number(given);
      // `Number("")` is 0, which would silently mean "break everything".
      if (given.trim() === "" || Number.isNaN(width) || width < 0) {
        fail(`${name} needs a number >= 0`);
      }
      options.maxWidth = width;
      break;
    }

    case "-i":
    case "--indent": {
      const indent = value();
      options.space = /^\d+$/.test(indent) ? Number(indent) : indent;
      break;
    }

    case "-s":
    case "--sort-keys":
      options.sortKeys = true;
      break;

    case "-c":
    case "--compact":
      options.arrayPadding = "";
      options.objectPadding = "";
      break;

    default:
      fail(`unknown option ${name}`);
  }
}

for (const file of files) {
  const data: unknown = JSON.parse(readFileSync(file, { encoding: "utf8" }));
  writeFileSync(file, beautify(data, options));
}
