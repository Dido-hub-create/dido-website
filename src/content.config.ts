import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import { entryFiles } from "./lib/entry-files.mjs";

const optionalText = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.string().optional(),
);

const imageFrame = z
  .object({
    fit: z.enum(["cover", "contain"]).nullish(),
    x: z.number().min(0).max(100).nullish(),
    y: z.number().min(0).max(100).nullish(),
    mobileFit: z.enum(["cover", "contain"]).nullish(),
    mobileX: z.number().min(0).max(100).nullish(),
    mobileY: z.number().min(0).max(100).nullish(),
  })
  .nullish();

const posts = defineCollection({
  loader: {
    name: "dido-safe-posts",
    async load(context) {
      const files = entryFiles(process.cwd(), "posts", ".md", {
        nested: true,
        report: (message: string) => context.logger.warn(message),
      });
      // Pass only validated regular files to Astro; its Markdown renderer and
      // schema remain unchanged. Clearing also removes previously valid entries.
      context.store.clear();
      await glob({
        pattern: files.length ? files : "__no_valid_posts__.md",
        base: "./src/content/posts",
        generateId: ({ entry }) => entry.slice(0, -3),
      }).load(context);
    },
  },
  schema: z.object({
    title: z.string(),
    cover: optionalText,
    gallery: z.preprocess(
      (value) => (value === null ? undefined : value),
      z.array(z.string()).optional(),
    ),
    coverFrame: imageFrame,
    galleryFrame: imageFrame,
    bodyFrame: imageFrame,
    imageFrames: z
      .array(z.object({ image: optionalText, frame: imageFrame }))
      .nullish(),
    description: optionalText,
    video: optionalText,
    youtubeUrl: optionalText,
    category: optionalText,
    topic: optionalText,
    date: z.preprocess(
      (value) => (value === null || value === "" ? undefined : value),
      z.coerce.date().optional(),
    ),
    status: optionalText,
    draft: z.boolean().optional(),
  }),
});
export const collections = { posts };
