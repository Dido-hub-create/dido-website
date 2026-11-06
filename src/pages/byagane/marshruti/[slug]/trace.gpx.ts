import type { APIRoute } from "astro";
import { loadRoutes, downloadPayload } from "../../../../lib/running.mjs";
export function getStaticPaths() {
  return loadRoutes()
    .filter((route) => route.gpxHref)
    .map((route) => ({ params: { slug: route.id }, props: { route } }));
}
export const GET: APIRoute = ({ props }) =>
  new Response(downloadPayload(props.route), {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="dido-route.gpx"',
      "X-Content-Type-Options": "nosniff",
    },
  });
