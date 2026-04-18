"use client";

import React, { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle, Info, AlertTriangle,
  Clock, User, Terminal, FileJson, Copy, Check
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { SyntaxHighlighter } from "@/components/assistant-ui/shiki-highlighter";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: number;
  user_id: string | null;
  user_name?: string;
  email?: string;
  level: string;
  source: string;
  message: string;
  details: string | null;
  content: string | null;
  created_at: string;
}

interface AdminLogsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logId?: number | null;
  initialLog?: LogEntry | null;
}

export function AdminLogsDrawer({ open, onOpenChange, logId, initialLog }: AdminLogsDrawerProps) {
  const [log, setLog] = useState<LogEntry | null>(initialLog || null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && logId && !initialLog) {
      fetchLogDetails(logId);
    } else if (initialLog) {
      setLog(initialLog);
    }
  }, [open, logId, initialLog]);

  const fetchLogDetails = async (id: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/logs?id=${id}`);
      const data = await res.json();
      if (data.logs && data.logs.length > 0) {
        setLog(data.logs[0]);
      }
    } catch (error) {
      console.error("Fetch log error:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Content copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const getLevelIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return <AlertCircle className="size-4 text-red-500" />;
      case 'warn': return <AlertTriangle className="size-4 text-amber-500" />;
      default: return <Info className="size-4 text-blue-500" />;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return <Badge variant="destructive">ERROR</Badge>;
      case 'warn': return <Badge className="bg-amber-500 hover:bg-amber-600">WARNING</Badge>;
      default: return <Badge variant="secondary">INFO</Badge>;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full flex flex-col p-0 gap-0 border-l border-zinc-200 dark:border-zinc-800">
        <SheetHeader className="p-4 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/50 pr-12">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {log && getLevelIcon(log.level)}
              <SheetTitle className="text-sm font-bold">System Log Details</SheetTitle>
            </div>
            {log && getLevelBadge(log.level)}
          </div>
          <SheetDescription className="text-xs">
            Detailed report for event ID #{log?.id || "..."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-20 text-center text-sm text-zinc-500 animate-pulse">Loading data...</div>
          ) : log ? (
            <div className="p-6 space-y-8">
              {/* Thông tin chung */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="size-3" /> TIMESTAMP
                  </span>
                  <p className="text-sm">
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss")}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    <Terminal className="size-3" /> SOURCE
                  </span>
                  <p className="text-sm truncate uppercase">
                    {log.source}
                  </p>
                </div>
                <div className="col-span-2 space-y-1 pt-2 border-t border-zinc-100 dark:border-zinc-900">
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    <User className="size-3" /> EXECUTED BY
                  </span>
                  <p className="text-sm font-medium">
                    {log.user_name ? `${log.user_name} (${log.email})` : "System Automated"}
                  </p>
                </div>
              </div>

              {/* Thông điệp chính */}
              <div className="space-y-2">
                <span className="text-sm font-bold text-zinc-400 uppercase tracking-wider">MESSAGE</span>
                <div className="p-4 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm leading-relaxed shadow-sm">
                  {log.message}
                </div>
              </div>

              {/* Chi tiết kỹ thuật */}
              {log.details && (
                <div className="space-y-2">
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                    <FileJson className="size-3" /> TECHNICAL DETAILS (STACK/PARAMS)
                  </span>
                  <div className="w-full min-w-0 grid grid-cols-1 overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-muted/30 shadow-sm">
                    <div className="aui-code-header-root flex items-center justify-between px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-muted/50 text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">
                      <span>{log.level === 'error' ? 'Error Log' : 'Context Data'}</span>
                      <button
                        onClick={() => copyToClipboard(log.details || "")}
                        className="flex items-center gap-1.5 text-zinc-400 hover:text-violet-500 transition-colors"
                        title="Copy details"
                      >
                        {copied ? (
                          <>
                            <Check className="size-3.5" />
                          </>
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="w-full min-w-0 overflow-hidden aui-shiki-base [&_pre]:overflow-x-auto [&_pre]:p-1 [&_pre]:bg-transparent! [&_pre]:text-xs [&_pre]:leading-relaxed custom-scrollbar">
                      <SyntaxHighlighter
                        code={log.details.trim()}
                        language="json"
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Nội dung liên quan */}
              {log.content && (
                <div className="space-y-2">
                  <span className="text-sm font-bold text-zinc-400 uppercase tracking-wider">RELATED CONTENT</span>
                  <div className="w-full min-w-0 overflow-x-auto custom-scrollbar p-4 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-sm italic text-zinc-600 dark:text-zinc-400 whitespace-pre">
                    {log.content}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-20 text-center text-sm text-zinc-500 italic">No log information found.</div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
