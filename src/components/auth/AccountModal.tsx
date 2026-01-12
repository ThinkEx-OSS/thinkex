"use client";

import {
  AccountSettingsCards,
  SecuritySettingsCards,
} from "@daveyplate/better-auth-ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountModal({ open, onOpenChange }: AccountModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[95vw] !w-[95vw] sm:!max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
        </DialogHeader>
        <div className="mt-4 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <AccountSettingsCards />
            </div>
            <div className="space-y-4">
              <SecuritySettingsCards />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

