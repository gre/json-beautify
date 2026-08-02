#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import beautify from "./index.js";

const filenames = process.argv.slice(2);

for (const filename of filenames) {
  const data = JSON.parse(readFileSync(filename, { encoding: "utf8" }));
  writeFileSync(filename, beautify(data, null, 2, 80));
}
