import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import beautify from "./index.js";

const binPath = fileURLToPath(new URL("./bin.js", import.meta.url));

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "json-beautify-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("rewrites a JSON file in place, beautified", () => {
  withTempDir((dir) => {
    const value = { b: 2, a: [1, 2, 3] };
    const file = join(dir, "sample.json");
    writeFileSync(file, JSON.stringify(value));

    const result = spawnSync(process.execPath, [binPath, file], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    const output = readFileSync(file, "utf8");
    assert.equal(output, beautify(value, null, 2, 80));
    assert.deepEqual(JSON.parse(output), value);
  });
});

test("rewrites multiple files given as arguments", () => {
  withTempDir((dir) => {
    const fileA = join(dir, "a.json");
    const fileB = join(dir, "b.json");
    writeFileSync(fileA, JSON.stringify({ x: 1 }));
    writeFileSync(fileB, JSON.stringify({ y: 2 }));

    const result = spawnSync(process.execPath, [binPath, fileA, fileB], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(fileA, "utf8")), { x: 1 });
    assert.deepEqual(JSON.parse(readFileSync(fileB, "utf8")), { y: 2 });
  });
});

test("exits with no changes when called with no files", () => {
  const result = spawnSync(process.execPath, [binPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
