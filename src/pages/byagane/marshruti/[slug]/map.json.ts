import type { APIRoute } from "astro";
import { loadRoutes, mapPayload } from "../../../../lib/running.mjs";
export function getStaticPaths() {
  return loadRoutes()
    .filter((route) => route.mapHref)
    .map((route) => ({ params: { slug: route.id }, props: { route } }));
}
export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(mapPayload(props.route)), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
