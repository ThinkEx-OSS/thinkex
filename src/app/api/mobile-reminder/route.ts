import { DesktopReminderEmail } from "@/components/email/desktop-reminder-email";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { error } = await resend.emails.send({
      from: "ThinkEx <hello@thinkex.app>",
      to: [normalizedEmail],
      subject: "Your ThinkEx link — open on desktop",
      react: DesktopReminderEmail(),
    });

    if (error) {
      console.error("[mobile-reminder] Resend error:", error);
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[mobile-reminder] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
