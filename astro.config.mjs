import { defineConfig } from "astro/config";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { assertNoPublicGpx, assertGeneratedGpx } from "./src/lib/running.mjs";
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  integrations: [
    {
      name: "dido-gpx-publication-guard",
      hooks: {
        "astro:build:start": () => {
          rmSync(resolve("dist"), { recursive: true, force: true });
          assertNoPublicGpx();
        },
        "astro:build:done": () => assertGeneratedGpx(),
      },
    },
  ],
});
