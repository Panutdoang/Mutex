import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workerSource = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const workerTarget = join(rootDir, "public", "pdf.worker.min.mjs");

mkdirSync(dirname(workerTarget), { recursive: true });
copyFileSync(workerSource, workerTarget);
