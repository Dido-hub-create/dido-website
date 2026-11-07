import { loadRoutes, analysisPayload } from "../../../../lib/running.mjs";
export function getStaticPaths() {
  return loadRoutes().filter((route) => route.analysisHref).map((route) => ({ params: { slug: route.id }, props: { route } }));
}
export function GET({ props }: { props: { route: ReturnType<typeof loadRoutes>[number] } }) {
  return new Response(JSON.stringify(analysisPayload(props.route)), { headers: { "Content-Type": "application/json" } });
}
