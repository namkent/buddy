"use client";

import { useEffect, useState } from "react";
import {
  Search, Filter, Clock, AlertCircle, Info,
  AlertTriangle, User, RefreshCw, Terminal,
  ChevronLeft, ChevronRight, FileJson
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { AdminLogsDrawer } from "@/components/admin/logs-drawer";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function SystemLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [level, source, page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });
      if (level !== "all") params.append("level", level);
      if (source !== "all") params.append("source", source);

      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (error) {
      toast.error("Không thể tải nhật ký hệ thống");
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log =>
    log.message.toLowerCase().includes(query.toLowerCase()) ||
    (log.user_name && log.user_name.toLowerCase().includes(query.toLowerCase()))
  );

  const getLevelBadge = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return <Badge variant="destructive" className="font-bold">ERROR</Badge>;
      case 'warn': return <Badge className="bg-amber-500 hover:bg-amber-600 font-bold">WARN</Badge>;
      default: return <Badge variant="secondary" className="font-bold text-blue-600 dark:text-blue-400">INFO</Badge>;
    }
  };

  const handleRowClick = (log: any) => {
    setSelectedLog(log);
    setIsDrawerOpen(true);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-10rem)] space-y-6 max-w-[1600px] mx-auto w-full">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1">System Logs</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Audit user actions, monitor system health, and debug RAG processing issues.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setPage(0); fetchLogs(); }}
            className="gap-2 border-zinc-300 dark:border-white/10"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters Area (Simplified) */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-1">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <Input
            placeholder="Search logs by message or user..."
            className="pl-10 h-9 bg-white/50 dark:bg-white/5 border-zinc-200 dark:border-white/10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Level</span>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-[110px] h-9 bg-white/50 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-xs">
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Source</span>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-[140px] h-9 bg-white/50 dark:bg-white/5 border-zinc-200 dark:border-white/10 text-xs">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="AI_FEEDBACK">AI Feedback</SelectItem>
                <SelectItem value="knowledge_base">Knowledge Base</SelectItem>
                <SelectItem value="auth">Authentication</SelectItem>
                <SelectItem value="system">System Core</SelectItem>
                <SelectItem value="users">User Management</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 flex flex-col border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-xl overflow-hidden shadow-sm min-h-0">
        <div className="bg-zinc-100/50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-white/10 shrink-0">
          <table className="w-full table-fixed text-sm border-separate border-spacing-0">
            <thead className="text-zinc-500 dark:text-zinc-400 uppercase text-sm tracking-wider">
              <tr className="h-12">
                <th className="w-[160px] px-6 font-bold text-center">Time</th>
                <th className="w-[80px] px-4 font-bold text-center">Level</th>
                <th className="w-[160px] px-4 font-bold text-center">Source</th>
                <th className="px-4 font-bold text-center">Message</th>
                <th className="w-[200px] px-4 font-bold text-center">User</th>
                <th className="w-[60px] px-4 font-bold text-center"></th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Table Body Container (Scrollable) */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full table-fixed text-sm border-separate border-spacing-0">
            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="h-14 bg-zinc-50/50 dark:bg-white/5" />
                  </tr>
                ))
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-20 text-sm text-zinc-500 italic">
                    No logs found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr
                    key={log.id}
                    className="hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer transition-all h-14 border-b border-zinc-100 dark:border-white/5"
                    onClick={() => handleRowClick(log)}
                  >
                    <td className="w-[160px] px-6 font-medium text-sm tabular-nums text-zinc-500 text-center">
                      {format(new Date(log.created_at), "dd/MM HH:mm:ss")}
                    </td>
                    <td className="w-[80px] px-4 text-center">
                      {getLevelBadge(log.level)}
                    </td>
                    <td className="w-[160px] text-left px-4 text-center">
                      <div className="flex gap-1.5 text-[12px] font-bold uppercase text-zinc-400 tracking-tighter">
                        <Terminal className="size-3" />
                        {log.source.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="px-4">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1" title={log.message}>
                        {log.message}
                      </p>
                    </td>
                    <td className="w-[200px] px-4">
                      <div className="flex items-center justify-center gap-2">
                        <div className="size-6 rounded-full bg-indigo-500/10 flex items-center justify-center">
                          <User className="size-3 text-indigo-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate leading-none mb-1">
                            {log.user_name || "System"}
                          </p>
                          <p className="text-[12px] text-zinc-400 truncate leading-none font-bold tracking-tighter">
                            {log.email ? log.email : "AUTO"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="w-[60px] px-4 text-center text-center">
                      {log.details && <FileJson className="size-4 text-indigo-500/50 mx-auto" />}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Area */}
      <div className="flex items-center justify-between px-2">
        <p className="text-xs text-zinc-500 font-medium">
          Showing {page * limit + 1} to {Math.min((page + 1) * limit, page * limit + filteredLogs.length)} of latest records
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="icon" className="size-8"
            disabled={page === 0 || loading}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 px-3 h-8 flex items-center justify-center rounded-md text-xs font-bold">
            {page + 1}
          </div>
          <Button
            variant="outline" size="icon" className="size-8"
            disabled={logs.length < limit || loading}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <AdminLogsDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        initialLog={selectedLog}
      />

      <AdminLogsDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        initialLog={selectedLog}
      />
    </div>
  );
}
