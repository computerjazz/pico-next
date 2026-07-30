export async function GET() {
  return new Response("did:plc:nzj76pqy5bq3tvkf3bgeah5d", {
    headers: { "Content-Type": "text/plain" },
  });
}
