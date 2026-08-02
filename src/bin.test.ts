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

test("--sort-keys sorts object keys", () => {
  withTempDir((dir) => {
    const file = join(dir, "s.json");
    writeFileSync(file, JSON.stringify({ z: 1, a: 2, m: 3 }));

    const result = spawnSync(process.execPath, [binPath, "--sort-keys", file], {
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    const output = readFileSync(file, "utf8");
    assert.deepEqual(Object.keys(JSON.parse(output)), ["a", "m", "z"]);
    assert.equal(output, beautify({ z: 1, a: 2, m: 3 }, { sortKeys: true }));
  });
});

test("--width and --indent are honoured, in both syntaxes", () => {
  withTempDir((dir) => {
    const value = { a: [1, 2, 3], b: { c: 4 } };
    const file = join(dir, "w.json");
    writeFileSync(file, JSON.stringify(value));

    const result = spawnSync(process.execPath, [binPath, "--width=20", "-i", "4", file], {
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    const output = readFileSync(file, "utf8");
    assert.equal(output, beautify(value, { maxWidth: 20, space: 4 }));
    for (const line of output.split("\n")) assert.ok(line.length <= 20, line);
  });
});

test("--compact drops the padding inside single-line collections", () => {
  withTempDir((dir) => {
    const value = { a: [1, 2] };
    const file = join(dir, "c.json");
    writeFileSync(file, JSON.stringify(value));

    const result = spawnSync(process.execPath, [binPath, "-c", file], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(file, "utf8"), '{"a": [1, 2]}');
  });
});

test("--help prints usage and exits 0", () => {
  const result = spawnSync(process.execPath, [binPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: json-beautify/);
});

test("an unknown option fails with usage on stderr", () => {
  const result = spawnSync(process.execPath, [binPath, "--nope"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown option --nope/);
});

test("a flag missing its value fails", () => {
  const result = spawnSync(process.execPath, [binPath, "--width"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--width needs a value/);
});

test("`--` ends option parsing", () => {
  withTempDir((dir) => {
    const file = join(dir, "-weird.json");
    writeFileSync(file, JSON.stringify({ a: 1 }));

    const result = spawnSync(process.execPath, [binPath, "--", file], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { a: 1 });
  });
});

test("--width rejects an empty or negative value", () => {
  for (const args of [["--width="], ["--width", "-5"], ["--width", "nope"]]) {
    const result = spawnSync(process.execPath, [binPath, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1, `expected failure for ${args.join(" ")}`);
    assert.match(result.stderr, /--width needs a number >= 0/);
  }
});
