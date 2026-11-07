import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGpx } from "../src/lib/gpx.mjs";
import { reviewGpx } from "../src/lib/gpx-review.mjs";

// No automatic import, route creation, upload, publishing or printing of input data.
const args = process.argv.slice(2), outputFlag = args.indexOf("--output");
try {
  if (outputFlag !== 0 || args.length < 3) throw new Error();
  const output = resolve(args[1]), parent = realpathSync(dirname(output));
  const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
  const rel = relative(root, parent);
  const outsideCheckout = rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel);
  if (!outsideCheckout || existsSync(output)) throw new Error();
  const reviews = args.slice(2).map((file, index) => ({ input: index + 1, ...reviewGpx(parseGpx(readFileSync(file, "utf8")), { lapCount: 1 }) }));
  writeFileSync(output, JSON.stringify({ purpose: "private-review-not-for-deployment", reviews }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log("Локалният доклад е създаден извън проекта. Няма публикувани данни.");
} catch {
  console.error("Проверката не е изпълнена. Използвай: node scripts/review-private-gpx.mjs --output /private/existing-folder/new-report.json /private/route.gpx [...]. Изходът трябва да е нов файл извън проекта; входът — валиден GPX.");
  process.exitCode = 1;
}
