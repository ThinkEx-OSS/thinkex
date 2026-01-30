"use client";

import { useState, useCallback } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, User, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountModal } from "@/components/auth/AccountModal";
import { useUIStore } from "@/lib/stores/ui-store";

export function UserProfileDropdown() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showAccountModal, setShowAccountModal] = useState(false);
  const showJsonView = useUIStore((state) => state.showJsonView);
  const setShowJsonView = useUIStore((state) => state.setShowJsonView);

  const userName = session?.user?.name || session?.user?.email || "User";
  const userImage = session?.user?.image || undefined;

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
    router.push("/");
  }, [router]);

  // Anonymous user: show sign in/up buttons
  if (session?.user?.isAnonymous) {
    return (
      <div className="flex items-center gap-2">
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
            className="p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
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
          <DropdownMenuItem onClick={() => setShowJsonView(!showJsonView)} className="cursor-pointer">
            <Layers className="mr-2 h-4 w-4" />
            {showJsonView ? "Card View" : "JSON View"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowAccountModal(true)} className="cursor-pointer">
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

      <AccountModal open={showAccountModal} onOpenChange={setShowAccountModal} />
    </>
  );
}
