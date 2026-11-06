import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const optionalText = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.string().optional(),
);
const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    cover: optionalText,
    gallery: z.preprocess(
      (value) => (value === null ? undefined : value),
      z.array(z.string()).optional(),
    ),
    description: optionalText,
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
