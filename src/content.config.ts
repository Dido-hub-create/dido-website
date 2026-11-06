import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

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
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
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
