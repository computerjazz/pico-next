export const dynamic = "force-dynamic";
export const GET = () => {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_BUILD_ID ?? "" },
    { status: 200 },
  );
};
