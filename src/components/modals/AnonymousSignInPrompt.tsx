"use client";

import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AnonymousSignInPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnonymousSignInPrompt({
  open,
  onOpenChange,
}: AnonymousSignInPromptProps) {
  const router = useRouter();

  const handleSignIn = async () => {
    onOpenChange(false);
    router.push("/sign-in");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-md"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">We hope you're enjoying ThinkEx</DialogTitle>
          <DialogDescription className="text-base pt-2">
            Sign in to save your work and access it from anywhere. Your workspace will be automatically synced across all your devices.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Maybe later
          </Button>
          <Button
            onClick={handleSignIn}
            className="w-full sm:w-auto"
          >
            Sign in to save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

