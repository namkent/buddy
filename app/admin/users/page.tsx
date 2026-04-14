"use client";

import { useEffect, useState } from "react";
import { Trash2, ShieldBan, ShieldCheck, Mail, ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      <div className="flex flex-wrap gap-4 items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mb-2">User Management</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-base">Assign roles, manage access, and monitor user statuses.</p>
        </div>
        {/* Filter input */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Tìm theo tên hoặc email..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-xl border border-zinc-300 dark:border-white/10 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-sm w-72 focus:outline-none focus:ring-2 focus:ring-violet-500/50 placeholder-zinc-400"
          />
          {filter && (
            <button onClick={() => setFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white">
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/5 overflow-hidden shadow-2xl">
        {/* Scrollable table container — max height 70vh then scrolls */}
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-left text-base text-zinc-700 dark:text-zinc-300">
            <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 uppercase text-sm tracking-wider z-10">
              <tr>
                <th className="px-6 py-4 font-medium">User Profile</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Joined Date</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500 animate-pulse">Loading users...</td>
                </tr>
              ) : filteredUsers.map((u: any) => (
                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={u.avatar || ""} />
                        <AvatarFallback className="bg-violet-900/50 text-violet-300 font-medium">
                          {(u.user_name || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-zinc-900 dark:text-white">{u.user_name || "Unnamed"}</div>
                        <div className="text-sm text-zinc-500 flex items-center gap-1 mt-0.5">
                          <Mail className="size-3" /> {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Select
                      value={String(u.role_id)}
                      onValueChange={(val) => handleUpdateRole(u.id, parseInt(val))}
                      disabled={u.id === 'admin'}
                    >
                      <SelectTrigger className="w-28 bg-white dark:bg-zinc-900/50 border border-zinc-300/50 dark:border-white/10">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Guest</SelectItem>
                        <SelectItem value="2">User</SelectItem>
                        <SelectItem value="3">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-6 py-4">
                    {u.is_banned ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                        <ShieldAlert className="size-3" /> Banned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <ShieldCheck className="size-3" /> Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400 text-sm text-nowrap">
                    {new Date(u.created_at).toLocaleDateString() || "Unknown"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggleBan(u.id, u.is_banned)}
                        disabled={u.id === 'admin'}
                        className={`p-1.5 rounded-lg transition-colors tooltip ${u.is_banned
                          ? "hover:bg-emerald-500/20 hover:text-emerald-400 text-zinc-500"
                          : "hover:bg-amber-500/20 hover:text-amber-400 text-zinc-500"
                          }`}
                        title={u.is_banned ? "Un-Ban User" : "Ban User"}
                      >
                        <ShieldBan className="size-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        disabled={u.id === 'admin'}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 text-zinc-500 transition-colors tooltip"
                        title="Delete User"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
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
