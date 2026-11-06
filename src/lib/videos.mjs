import { readEntries, entryDiagnostic } from "./entry-files.mjs";
import { referenceId } from "./running.mjs";

const text = (value) => typeof value === "string" ? value.trim() : "";
const idPattern = /^[a-zA-Z0-9_-]{11}$/;
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

export function youtubeVideoId(value) {
  try {
    const url = new URL(text(value));
    if (url.protocol !== "https:" || url.username || url.password || url.port) return undefined;
    let id;
    if (url.hostname === "youtu.be") {
      if (!/^\/[a-zA-Z0-9_-]{11}\/?$/.test(url.pathname)) return undefined;
      id = url.pathname.split("/")[1];
    } else if (youtubeHosts.has(url.hostname)) {
      if (url.pathname === "/watch" && url.searchParams.getAll("v").length === 1) id = url.searchParams.get("v");
      else if (/^\/shorts\/[a-zA-Z0-9_-]{11}\/?$/.test(url.pathname)) id = url.pathname.split("/")[2];
    }
    return idPattern.test(id ?? "") ? id : undefined;
  } catch { return undefined; }
}

export function youtubeChannelUrl(value) {
  try {
    const url = new URL(text(value));
    if (url.protocol !== "https:" || !youtubeHosts.has(url.hostname) || url.username || url.password || url.port) return undefined;
    if (!/^\/(?:@[\p{L}\p{N}_.-]+|channel\/UC[a-zA-Z0-9_-]{22}|(?:c|user)\/[a-zA-Z0-9_.-]+)(?:\/videos)?\/?$/u.test(decodeURIComponent(url.pathname))) return undefined;
    url.search = ""; url.hash = "";
    return url.href;
  } catch { return undefined; }
}

export function videoFromUrl(url, title, description = "") {
  const videoId = youtubeVideoId(url);
  return videoId ? {
    videoId, title: text(title), description: text(description),
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  } : undefined;
}

export function loadVideos(root = process.cwd()) {
  return readEntries(root, "videos").flatMap(({ id, data }) => {
    if (data.status !== "published") return [];
    const video = videoFromUrl(data.url, data.title, data.description);
    if (!video || !video.title) {
      entryDiagnostic("videos", `${id}.json`, "Нужно е заглавие и валиден HTTPS YouTube линк.");
      return [];
    }
    return [{ ...video, id, cover: text(data.cover), featured: data.featured === true,
      order: typeof data.order === "number" && Number.isFinite(data.order) ? data.order : 100 }];
  }).sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order || a.id.localeCompare(b.id));
}

export function postVideo(data, videos) {
  // An explicit collection reference respects unpublishing/deletion. Never fall
  // back to a saved direct link when the referenced video is hidden.
  if (text(data.video)) return videos.find((video) => video.id === referenceId(data.video, "videos"));
  return videoFromUrl(data.youtubeUrl, data.title);
}
