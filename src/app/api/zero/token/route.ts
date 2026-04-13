import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getZeroTokenSession } from "@/lib/zero/token-session";

export async function GET() {
  const session = await getZeroTokenSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const zeroAuthSecret = process.env.ZERO_AUTH_SECRET;
  if (!zeroAuthSecret) {
    return NextResponse.json(
      { error: "ZERO_AUTH_SECRET is not configured" },
      { status: 500 },
    );
  }

  const secret = new TextEncoder().encode(zeroAuthSecret);
  const token = await new SignJWT({
    sub: session.user.id,
    name: session.user.name,
    email: session.user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);

  return NextResponse.json({ token });
}
