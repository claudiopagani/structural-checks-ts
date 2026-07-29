import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import path from "node:path";

import { build } from "esbuild";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const result = await build({
  bundle: true,
  entryPoints: [path.join(repositoryRoot, "dist", "index.js")],
  format: "esm",
  metafile: true,
  platform: "browser",
  target: ["es2022"],
  write: false,
});

assert.equal(result.outputFiles.length, 1);
const output = result.outputFiles[0];
assert.ok(output !== undefined);
const bundle = output.text;
assert.doesNotMatch(bundle, /(?:from\s+|import\s*\()["']node:/u);

const bundleUrl = `data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}`;
const workerSource = `
  import { parentPort } from "node:worker_threads";
  import * as library from ${JSON.stringify(bundleUrl)};
  const resolver = library.createUnitResolver(
    { force: "kN", length: "m" },
    { force: "N", length: "mm" }
  );
  parentPort.postMessage({
    exportCount: Object.keys(library).length,
    moment: resolver.moment(2)
  });
`;
const workerUrl = new URL(
  `data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`,
);
const worker = new Worker(workerUrl);

const message = await new Promise<{ exportCount: number; moment: number }>((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error("Web Worker smoke test timed out."));
  }, 10_000);

  worker.once("message", (value: { exportCount: number; moment: number }) => {
    clearTimeout(timeout);
    resolve(value);
  });
  worker.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
});

await worker.terminate();
assert.ok(message.exportCount >= 23);
assert.equal(message.moment, 2_000_000);

console.log(
  `Browser bundle and Web Worker check passed ` +
    `(${Math.ceil(output.contents.byteLength / 1024)} KiB, ${message.exportCount} exports).`,
);
