"use client";

import { useCustomer } from "autumn-js/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth-client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { LogOut, User } from "lucide-react";
import type { InitialAuth } from "./HomeShell";

const AccountModal = dynamic(
  () =>
    import("@/components/auth/AccountModal").then((mod) => ({
      default: mod.AccountModal,
    })),
  { ssr: false },
);

interface UserProfileDropdownProps {
  initialAuth?: InitialAuth;
}

type PremiumBalance = {
  balance?: number;
  limit?: number;
  unlimited?: boolean;
  remaining?: number;
  granted?: number;
};

function CreditsBadge() {
  const { customer } = useCustomer() as {
    customer?: {
      features?: {
        premium_message?: PremiumBalance;
      };
      balances?: {
        premium_message?: PremiumBalance;
      };
    } | null;
  };

  const premiumBalance =
    customer?.features?.premium_message ?? customer?.balances?.premium_message;

  if (!premiumBalance || premiumBalance.unlimited) return null;

  const remaining = premiumBalance.balance ?? premiumBalance.remaining ?? 0;
  const limit = premiumBalance.limit ?? premiumBalance.granted ?? 0;
  const pct = limit > 0 ? (remaining / limit) * 100 : 0;
  const dotColor =
    pct > 20 ? "bg-green-500" : pct > 0 ? "bg-amber-500" : "bg-red-500";

  return (
    <>
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span>{remaining} premium messages left</span>
        </div>
      </div>
      <DropdownMenuSeparator />
    </>
  );
}

export function UserProfileDropdown({ initialAuth }: UserProfileDropdownProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [showAccountModal, setShowAccountModal] = useState(false);

  const isAnonymous =
    session !== undefined
      ? !session || !!session.user?.isAnonymous
      : (initialAuth?.isAnonymous ?? true);

  const userName =
    session !== undefined
      ? session?.user?.name || session?.user?.email || "User"
      : (initialAuth?.userName ?? "User");

  const userImage =
    session !== undefined
      ? session?.user?.image || undefined
      : (initialAuth?.userImage ?? undefined);

  const getInitials = (name: string) => {
    if (name === "User") return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push("/home");
  }, [router]);

  if (isAnonymous) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Link href="/auth/sign-in">
          <Button variant="ghost" size="sm" className="text-foreground">
            Sign in
          </Button>
        </Link>
        <Link href="/auth/sign-up">
          <Button size="sm">Sign up</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="cursor-pointer rounded-md p-1 transition-colors hover:bg-white/10"
            aria-label={`Open menu for ${userName}`}
            aria-haspopup="menu"
          >
            <Avatar className="h-8 w-8 rounded-md">
              {userImage && <AvatarImage src={userImage} alt={userName} />}
              <AvatarFallback className="rounded-md bg-primary/10 text-sm">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          <CreditsBadge />
          <DropdownMenuItem
            onClick={() => setShowAccountModal(true)}
            className="cursor-pointer"
          >
            <User className="mr-2 h-4 w-4" />
            Account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AccountModal
        open={showAccountModal}
        onOpenChange={setShowAccountModal}
      />
    </>
  );
}
