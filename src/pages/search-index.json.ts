import { allPosts } from '../lib/posts';
import { buildSearchIndex } from '../lib/search-index.mjs';

export async function GET() {
  const index = await buildSearchIndex({posts:await allPosts()});
  return new Response(JSON.stringify(index),{headers:{'Content-Type':'application/json; charset=utf-8'}});
}
