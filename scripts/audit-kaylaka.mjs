import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseGpx } from "../src/lib/gpx.mjs";
import { auditElevation } from "../src/lib/elevation-audit.mjs";
const source = readFileSync(new URL("../src/data/gpx/marathonkaylaka21km.gpx", import.meta.url));
console.log(JSON.stringify({ sha256: createHash("sha256").update(source).digest("hex"), ...auditElevation(parseGpx(source.toString("utf8"))) }, null, 2));
