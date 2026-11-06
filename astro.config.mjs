import { defineConfig } from "astro/config";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { assertNoPublicGpx, assertGeneratedGpx, writeGpxHeaders } from "./src/lib/running.mjs";
import { clearSocialImages } from "./src/lib/social.mjs";
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  integrations: [
    {
      name: "dido-gpx-publication-guard",
      hooks: {
        "astro:build:start": () => {
          rmSync(resolve("dist"), { recursive: true, force: true });
          clearSocialImages();
          assertNoPublicGpx();
        },
        "astro:build:done": () => {
          assertGeneratedGpx();
          writeGpxHeaders();
        },
      },
    },
  ],
});
