export const dynamic = "force-static";

const BUILD_TIME =
  process.env.NODE_ENV === "development"
    ? "dev"
    : new Date().toISOString();

export function GET() {
  return new Response(BUILD_TIME, {
    headers: { "content-type": "text/plain" },
  });
}
