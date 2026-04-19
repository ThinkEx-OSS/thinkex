import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function ChatV2IndexPage() {
  const headersObj = await headers();
  const session = await auth.api.getSession({ headers: headersObj });

  if (!session?.user?.id) {
    redirect("/auth/sign-in?redirect_url=/chat-v2");
  }

  redirect(`/chat-v2/${crypto.randomUUID()}`);
}
