"use client";

import {useSession, signIn, signOut} from "next-auth/react";
import {LogIn, LogOut} from "lucide-react";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";

export function UserProvider() {
  const {data: session, status} = useSession();

  if (status === "loading") {
    return (
      <div className="flex flex-row gap-2 pl-2 items-center opacity-50">
        <div className="size-8 rounded-lg bg-muted animate-pulse"/>
        <div className="flex flex-col gap-1">
          <div className="h-3 w-20 bg-muted animate-pulse"/>
          <div className="h-2 w-12 bg-muted animate-pulse"/>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <button
        onClick={() => signIn()}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md transition-colors"
      >
        <LogIn className="size-4 mr-2"/>
        <span>Login</span>
      </button>
    );
  }

  // 3. Hiển thị thông tin thực tế từ Session
  return (
    <div className="flex flex-row items-center gap-3 pl-2 py-2">
      <div
        className="flex aspect-square size-10 items-center justify-center rounded-full overflow-hidden border border-sidebar-border shadow-sm">
        <Avatar className="h-full w-full rounded-full">
          <AvatarImage
            src={session.user?.image ?? ""}
            alt={session.user?.name ?? "User"}
            className="object-cover"
          />
          <AvatarFallback>
            <span className="text-xs font-bold">
              {session.user?.name?.charAt(0).toUpperCase() || "U"}
            </span>
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 leading-none overflow-hidden">
        <span className="font-semibold text-sm truncate">
          {session.user?.name}
        </span>
        <span className="text-[10px] text-muted-foreground truncate">
          {session.user?.email}
        </span>
      </div>

      <button
        onClick={() => signOut()}
        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-destructive transition-colors"
        title="Logout"
      >
        <LogOut className="size-3"/>
      </button>
    </div>
  );
}