import { jwtVerify } from "jose";

export async function getZeroContext(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { userId: null };
  }

  const token = authHeader.slice(7);
  const zeroAuthSecret = process.env.ZERO_AUTH_SECRET;
  if (!zeroAuthSecret) {
    return { userId: null };
  }

  try {
    const secret = new TextEncoder().encode(zeroAuthSecret);
    const { payload } = await jwtVerify(token, secret);
    return { userId: typeof payload.sub === "string" ? payload.sub : null };
  } catch {
    return { userId: null };
  }
}
