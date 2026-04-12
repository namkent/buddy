"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function GuestModal() {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md text-center" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold mb-2 tracking-tight flex justify-center w-full text-red-500">
            WARNING
          </DialogTitle>
          <DialogDescription className="leading-relaxed text-center">
            Xin chào! Tài khoản của bạn hiện đang ở cấp độ{" "}
            <strong className="text-foreground">Guest</strong>.<br /><br />
            Bạn cần liên hệ với Quản trị viên để được cấp quyền sử dụng hệ thống Trợ lý ảo.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-center flex gap-3 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={() => signOut({ callbackUrl: "/api/auth/signin" })}>
            Logout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
