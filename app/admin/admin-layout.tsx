"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, LogOut, PanelLeftClose, PanelLeftOpen, Brain, ScrollText } from "lucide-react";
import { ThemeToggle } from "@/components/assistant-ui/theme-toggle";

export default function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex h-[100dvh] bg-zinc-50 dark:bg-[#0a0a0f] text-zinc-900 dark:text-white overflow-hidden transition-colors duration-500">
      {/* Sidebar */}
      <aside className={`flex flex-col border-r border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-zinc-950/50 backdrop-blur-xl transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-zinc-200 dark:border-white/10">
          {collapsed ? (
            <div className="w-full flex justify-center text-xl">⚡</div>
          ) : (
            <div className="flex items-center gap-3 text-violet-600 dark:text-violet-400 font-bold text-lg tracking-tight overflow-hidden whitespace-nowrap">
              <span className="text-2xl">⚡</span> MES Admin
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
          <Link href="/admin">
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${pathname === "/admin" ? "bg-white dark:bg-white/10 text-violet-600 dark:text-white shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5"} ${collapsed ? "justify-center px-0" : ""}`}>
              <LayoutDashboard className="size-5 shrink-0" />
              {!collapsed && <span className="font-medium text-base whitespace-nowrap">Dashboard</span>}
            </div>
          </Link>
          <Link href="/admin/knowledge">
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${pathname.startsWith("/admin/knowledge") ? "bg-white dark:bg-white/10 text-violet-600 dark:text-white shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5"} ${collapsed ? "justify-center px-0" : ""}`}>
              <Brain className="size-5 shrink-0" />
              {!collapsed && <span className="font-medium text-base whitespace-nowrap">Knowledge</span>}
            </div>
          </Link>
          <Link href="/admin/users">
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${pathname === "/admin/users" ? "bg-white dark:bg-white/10 text-violet-600 dark:text-white shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5"} ${collapsed ? "justify-center px-0" : ""}`}>
              <Users className="size-5 shrink-0" />
              {!collapsed && <span className="font-medium text-base whitespace-nowrap">Users</span>}
            </div>
          </Link>
          <Link href="/admin/settings">
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${pathname.startsWith("/admin/settings") ? "bg-white dark:bg-white/10 text-violet-600 dark:text-white shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5"} ${collapsed ? "justify-center px-0" : ""}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              {!collapsed && <span className="font-medium text-base whitespace-nowrap">Settings</span>}
            </div>
          </Link>
          <Link href="/admin/logs">
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${pathname === "/admin/logs" ? "bg-white dark:bg-white/10 text-violet-600 dark:text-white shadow-sm" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-white/5"} ${collapsed ? "justify-center px-0" : ""}`}>
              <ScrollText className="size-5 shrink-0" />
              {!collapsed && <span className="font-medium text-base whitespace-nowrap">Logs</span>}
            </div>
          </Link>
        </nav>

        <div className="p-3 border-t border-zinc-200 dark:border-white/10">
          <Link href="/">
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors ${collapsed ? "justify-center px-0" : ""}`}>
              <LogOut className="size-5 shrink-0" />
              {!collapsed && <span className="font-medium text-base whitespace-nowrap">Back to Chat</span>}
            </div>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto relative">
        {/* Sticky top-bar — nút toggle luôn hiển thị ngoài sidebar */}
        <div className="sticky top-0 z-50 h-16 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-white/10 bg-zinc-50/80 dark:bg-[#0a0a0f]/80 backdrop-blur-xl">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors focus:outline-none"
            title={collapsed ? "Mở sidebar" : "Thu gọn sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
          <ThemeToggle />
        </div>

        <div className="absolute top-0 right-[-10%] w-[500px] h-[500px] bg-violet-600/5 dark:bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative z-10 w-full p-4 md:p-8 flex flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}
