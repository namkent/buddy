"use client";

import { useEffect, useState } from "react";
import { Trash2, ShieldBan, ShieldCheck, Mail, ShieldAlert, Search, RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchUsers = () => {
    fetch("/api/admin/users")
      .then(res => res.json())
      .then(data => {
        if (!data.error) setUsers(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpdateRole = async (id: string, newRoleId: number) => {
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role_id: newRoleId })
    });
    if (res.ok) fetchUsers();
  };

  const handleToggleBan = async (id: string, currentBanStatus: boolean) => {
    const confirmingInfo = currentBanStatus
      ? "Are you sure you want to Un-ban this user?"
      : "Are you sure you want to Ban this user? They will not be able to interact with the system.";
    if (!confirm(confirmingInfo)) return;

    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_banned: !currentBanStatus })
    });
    if (res.ok) fetchUsers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("CRITICAL WARNING: Deleting this user will permanently erase all their chat threads and messages! Type 'delete' to confirm... just kidding, but press OK to verify.")) return;
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    if (res.ok) fetchUsers();
  };

  const filteredUsers = users.filter(u =>
    (u.user_name || "").toLowerCase().includes(filter.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="max-w-6xl w-full mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mb-2">User Management</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-base">Assign roles, manage access, and monitor user statuses.</p>
        </div>
      </div>

      {/* Filters Area (Simplified) */}
      <div className="flex flex-wrap items-center justify-between gap-4 py-1">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <Input
            placeholder="Search by name or email..."
            className="pl-10 h-9 bg-white/50 dark:bg-white/5 border-zinc-200 dark:border-white/10"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mr-2">Quick Actions</span>
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading} className="h-9 border-zinc-200 dark:border-white/10 bg-white/50 dark:bg-white/5">
            <RefreshCw className={cn("size-3.5 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden shadow-sm flex flex-col min-h-0">
        {/* Table Header Container (Fixed) */}
        <div className="bg-zinc-100/50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-white/10 shrink-0">
          <table className="w-full table-fixed text-sm border-separate border-spacing-0">
            <thead className="text-zinc-500 dark:text-zinc-400 uppercase text-sm tracking-wider">
              <tr className="h-12">
                <th className="px-6 py-4 font-bold text-left">User Profile</th>
                <th className="w-[160px] px-6 py-4 font-bold text-center">Role</th>
                <th className="w-[160px] px-6 py-4 font-bold text-center">Status</th>
                <th className="w-[160px] px-6 py-4 font-bold text-center text-nowrap">Joined Date</th>
                <th className="w-[120px] px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Table Body Container (Scrollable) — max height 70vh then scrolls */}
        <div className="overflow-auto max-h-[70vh] custom-scrollbar">
          <table className="w-full table-fixed text-sm border-separate border-spacing-0">
            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
              {loading ? (
                <tr className="animate-pulse">
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">Loading users...</td>
                </tr>
              ) : filteredUsers.map((u: any) => (
                <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors border-b border-zinc-100 dark:border-white/5">
                  <td className="px-6 py-4 text-left">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 shrink-0 border border-zinc-200 dark:border-white/5 shadow-sm">
                        <AvatarImage src={u.avatar || ""} />
                        <AvatarFallback className="bg-indigo-500 dark:bg-indigo-600 text-white border-none shadow-sm shadow-indigo-500/20 font-bold text-sm">
                          {(u.user_name || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-900 dark:text-white truncate">{u.user_name || "Unnamed"}</div>
                        <div className="text-[13px] text-zinc-500 flex items-center gap-1 mt-0.5 truncate">
                          <Mail className="size-3" /> {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="w-[160px] px-6 py-4">
                    <div className="flex justify-center">
                      <Select
                        value={String(u.role_id)}
                        onValueChange={(val) => handleUpdateRole(u.id, parseInt(val))}
                        disabled={u.id === 'admin'}
                      >
                        <SelectTrigger className="w-28 h-9 bg-white dark:bg-zinc-900/50 border border-zinc-300/50 dark:border-white/10 text-xs">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Guest</SelectItem>
                          <SelectItem value="2">User</SelectItem>
                          <SelectItem value="3">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td className="w-[160px] px-6 py-4 text-center">
                    <div className="flex justify-center">
                      {u.is_banned ? (
                        <Badge variant="destructive" className="w-[100px] h-8 justify-center rounded-md text-[11px] bg-red-500/10 text-red-500 hover:bg-red-500/20 border-none font-bold uppercase">
                          <ShieldAlert className="size-3 mr-1" /> Banned
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="w-[100px] h-8 justify-center rounded-md text-[11px] bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 border-none font-bold uppercase">
                          <ShieldCheck className="size-3 mr-1" /> Active
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="w-[160px] px-6 py-4 text-zinc-500 dark:text-zinc-400 text-[13px] text-center">
                    {new Date(u.created_at).toLocaleDateString() || "Unknown"}
                  </td>
                  <td className="w-[120px] px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => handleToggleBan(u.id, u.is_banned)}
                        disabled={u.id === 'admin'}
                        className={u.is_banned ? "size-8 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10" : "size-8 text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10"}
                        title={u.is_banned ? "Un-ban User" : "Ban User"}
                      >
                        {u.is_banned ? <ShieldCheck className="size-4" /> : <ShieldBan className="size-4" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => handleDelete(u.id)}
                        disabled={u.id === 'admin'}
                        className="size-8 text-zinc-500 hover:text-red-500 hover:bg-red-500/10"
                        title="Delete User"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 italic">
                    {filter ? `Không tìm thấy user nào khớp với "${filter}"` : "No users found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
