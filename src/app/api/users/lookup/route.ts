import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, user } from "@/lib/db/client";
import { eq } from "drizzle-orm";

/**
 * GET /api/users/lookup?email=user@example.com
 * Look up a user by email address
 * 
 * NOTE: Better Auth doesn't have a built-in user lookup API like Clerk.
 * This implementation queries the Better Auth user table directly.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Query Better Auth user table directly
    const users = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (!users || users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const foundUser = users[0];

    return NextResponse.json({
      user: {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name || email,
        imageUrl: foundUser.image || undefined,
      },
    });
  } catch (error) {
    console.error("Failed to lookup user:", error);
    return NextResponse.json({ error: "Failed to lookup user" }, { status: 500 });
  }
}

