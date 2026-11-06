import { readEntries, entryDiagnostic } from './entry-files.mjs';
import { normalizeImage } from './content-utils.mjs';
import { readFileSync, lstatSync, realpathSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const text = value => typeof value === 'string' ? value.trim() : '';
const pending = new Map();
// Local raster sources only; symlinks, remote URLs, oversized and corrupt files fail closed.
export async function albumImage(value, root = process.cwd()) {
  const source = normalizeImage(text(value));
  if (!source?.startsWith('/images/') || !/\.(jpe?g|png|webp|avif)$/i.test(source)) return undefined;
  try {
    const file = resolve(root, 'public', decodeURIComponent(source.slice(1)));
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(file) !== file || stat.size > 25 * 1024 * 1024) return undefined;
    const buffer = readFileSync(file), hash = createHash('sha256').update(buffer).digest('hex').slice(0,24);
    const key = root + hash;
    if (!pending.has(key)) pending.set(key, (async () => {
      const info = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
      if (!['jpeg','png','webp','avif','heif'].includes(info.format) || (info.pages ?? 1) > 1) return undefined;
      mkdirSync(resolve(root,'dist/gallery'), { recursive:true });
      const variants = {};
      for (const width of [400,800,1920]) {
        const path = `/gallery/${hash}-${width}.webp`;
        await sharp(buffer,{limitInputPixels:40_000_000}).rotate().resize({width,height:width === 1920 ? 1920 : undefined,fit:'inside',withoutEnlargement:true}).webp({quality:80}).toFile(resolve(root,'dist',path.slice(1)));
        variants[width] = path;
      }
      return { small:variants[400], medium:variants[800], large:variants[1920] };
    })().catch(() => undefined));
    const image = await pending.get(key);
    return image ? { ...image, original: source } : undefined;
  } catch { return undefined; }
}
export async function loadAlbums(root = process.cwd()) {
  const albums = [];
  for (const {id,data} of readEntries(root,'albums')) {
    if (data.status !== 'published') continue;
    if (!text(data.title) || !Array.isArray(data.photos) || data.photos.length > 100) {
      entryDiagnostic('albums',id+'.json','Нужно е заглавие и списък с до 100 снимки.');continue;
    }
    const photos = [];
    for (const value of data.photos) {
      const image = await albumImage(value,root);
      if (image) photos.push(image);
      else entryDiagnostic('albums',id+'.json','Липсваща или невалидна снимка е пропусната.');
    }
    const cover = await albumImage(data.cover,root) ?? photos[0];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(text(data.date)) && !Number.isNaN(Date.parse(data.date)) && new Date(data.date).toISOString().slice(0,10) === data.date ? data.date : undefined;
    albums.push({id,title:text(data.title),description:text(data.description),date,photos,cover,href:`/galeria/${encodeURIComponent(id)}/`});
  }
  return albums.sort((a,b)=>(b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
}
