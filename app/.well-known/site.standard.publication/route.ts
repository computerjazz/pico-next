export async function GET() {
  return new Response(
    "at://did:plc:nzj76pqy5bq3tvkf3bgeah5d/site.standard.publication/self",
    { headers: { "Content-Type": "text/plain" } },
  );
}
