import { getCollection } from "astro:content";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  categoryFor,
  excerpt,
  isPublished,
  normalizeImage,
} from "./content-utils.mjs";

export function usableImage(value?: string | null) {
  const image = normalizeImage(value);
  if (!image || image.startsWith("https://")) return image;
  try {
    return existsSync(resolve("public", decodeURIComponent(image.slice(1))))
      ? image
      : undefined;
  } catch {
    return undefined;
  }
}

export async function allPosts() {
  return (await getCollection("posts", ({ data }) => isPublished(data)))
    .sort(
      (a, b) =>
        (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0) ||
        b.id.localeCompare(a.id),
    )
    .map((post) => ({
      ...post,
      href: `/posts/${post.id.split("/").map(encodeURIComponent).join("/")}/`,
      category: categoryFor(post.data.category),
      cover: usableImage(post.data.cover),
      summary:
        post.data.description ||
        excerpt(post.body ?? "") ||
        "Прочетете цялата публикация.",
    }));
}
export type Post = Awaited<ReturnType<typeof allPosts>>[number];
export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
