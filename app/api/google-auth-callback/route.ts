export async function GET(req: Request) {
  console.log("GET: google-auth-callback", req);
  return new Response(null, { status: 200 });
}
