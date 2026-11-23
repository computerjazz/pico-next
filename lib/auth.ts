import jwt from "jsonwebtoken";

export function extractAuthToken(authHeader?: string | null) {
  const authPrefix = "Bearer ";
  if (!authHeader?.startsWith(authPrefix)) {
    return null;
  }

  const token = authHeader.slice(authPrefix.length);
  return token;
}

export async function validateTokenDefault(token: string) {
  await jwt.verify(token, process.env.JWT_SECRET!);
  return true;
}

export async function verifyAuth(
  req: Request,
  {
    tag = "",
    method = "GET",
    validateToken = validateTokenDefault,
  }: {
    tag?: string;
    method?: string;
    validateToken?: (token: string) => Promise<boolean>;
  },
) {
  const authHeader = req.headers.get("authorization");

  const token = extractAuthToken(authHeader);
  if (!token) {
    console.error(`${method} ${tag}: Missing token`);
    return new Response("Missing token", { status: 401 });
  }

  try {
    await validateToken(token);
  } catch {
    console.error(`${method} ${tag}: Invalid token`);
    return new Response("Invalid token", { status: 403 });
  }
}

export const validateDeckToken = async (token: string) => {
  const decoded = jwt.decode(token, { complete: true });
  (await jwt.verify(token, process.env.JWT_SECRET ?? "")) as Promise<boolean>;
  const hasScope =
    decoded?.payload &&
    typeof decoded !== "string" &&
    decoded.payload &&
    typeof decoded.payload !== "string" &&
    decoded.payload["scope"] === "cyberdeck";
  return !!hasScope;
};
