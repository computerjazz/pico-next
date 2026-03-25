import { fetchNewUspsEmails } from "@/lib/gmail";

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString(),
    );
    const historyId = decoded.historyId;
    const _newUspsEmails = await fetchNewUspsEmails(historyId);

    // Here you could save images, trigger your frontend, etc.
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(null, { status: 500 });
  }
}
