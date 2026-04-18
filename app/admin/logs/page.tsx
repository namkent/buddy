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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1">System Logs</h1>
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

      {/* Filters Area */}
      <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-white/5 p-4 rounded-xl border border-zinc-200 dark:border-white/10 shadow-sm">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <Input 
            placeholder="Search logs by message or user..." 
            className="pl-10 h-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Level</span>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-[120px] h-10">
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
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Source</span>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-[150px] h-10">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
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
      <div className="flex-1 flex flex-col border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-xl overflow-hidden shadow-sm transition-all hover:shadow-md min-h-0">
        <div className="flex-1 overflow-auto custom-scrollbar">
          <Table>
            <TableHeader className="sticky top-0 bg-white dark:bg-zinc-950 z-10 shadow-sm border-b">
              <TableRow className="bg-zinc-50/50 dark:bg-white/5 h-12 hover:bg-transparent">
                <TableHead className="px-6 text-[11px] font-bold uppercase tracking-widest w-[180px]">Time</TableHead>
                <TableHead className="px-4 text-[11px] font-bold uppercase tracking-widest w-[100px]">Level</TableHead>
                <TableHead className="px-4 text-[11px] font-bold uppercase tracking-widest w-[140px]">Source</TableHead>
                <TableHead className="px-4 text-[11px] font-bold uppercase tracking-widest">Message</TableHead>
                <TableHead className="px-4 text-[11px] font-bold uppercase tracking-widest w-[180px]">User</TableHead>
                <TableHead className="px-4 text-[11px] font-bold uppercase tracking-widest w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="animate-pulse">
                    <TableCell colSpan={6} className="h-14 bg-zinc-50/50 dark:bg-white/5" />
                  </TableRow>
                ))
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-sm text-zinc-500 italic">
                    No logs found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map(log => (
                  <TableRow 
                    key={log.id} 
                    className="hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer transition-all h-14"
                    onClick={() => handleRowClick(log)}
                  >
                    <TableCell className="px-6 font-medium text-[13px] tabular-nums text-zinc-500">
                      {format(new Date(log.created_at), "dd/MM HH:mm:ss")}
                    </TableCell>
                    <TableCell className="px-4">
                      {getLevelBadge(log.level)}
                    </TableCell>
                    <TableCell className="px-4">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-zinc-400 tracking-tighter">
                            <Terminal className="size-3" />
                            {log.source.replace('_', ' ')}
                        </div>
                    </TableCell>
                    <TableCell className="px-4">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1" title={log.message}>
                        {log.message}
                      </p>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-full bg-violet-500/10 flex items-center justify-center">
                            <User className="size-3 text-violet-500" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12px] font-semibold truncate leading-none mb-1">
                                {log.user_name || "System"}
                            </p>
                            <p className="text-[10px] text-zinc-400 truncate leading-none uppercase font-bold tracking-tighter">
                                {log.email ? log.email.split('@')[0] : "AUTO"}
                            </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 text-right">
                        {log.details && <FileJson className="size-4 text-violet-500/50" />}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: rgba(124, 58, 237, 0.1); 
          border-radius: 10px; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(124, 58, 237, 0.2); }
      `}</style>
    </div>
  );
}
