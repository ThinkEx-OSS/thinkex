import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getZeroTokenSession() {
  return auth.api.getSession({ headers: await headers() });
}
