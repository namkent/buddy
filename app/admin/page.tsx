"use client";

import { useEffect, useState } from "react";
import { Users, MessagesSquare, MessageCircle, Wifi, Trophy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface TopUser { user_name: string; email: string; avatar: string; msg_count: number }
interface WeeklyMsg { day_label: string; day_date: string; count: number }
interface Stats {
  usersCount: number;
  threadsCount: number;
  messagesCount: number;
  onlineCount: number;
  topUsers: TopUser[];
  weeklyMessages: WeeklyMsg[];
}

// Simple inline bar chart — no external library
function WeeklyBarChart({ data }: { data: WeeklyMsg[] }) {
  const max = Math.max(...data.map(d => Number(d.count)), 1);
  const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Fill all 7 days even if some have 0 messages
  const filled = DAY_ORDER.map(day => {
    const found = data.find(d => d.day_label === day);
    return { day, count: found ? Number(found.count) : 0 };
  });

  return (
    <div className="flex items-end gap-2 h-40 px-2 w-full">
      {filled.map(({ day, count }) => (
        <div key={day} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{count || ""}</span>
          <div className="w-full rounded-t-md bg-violet-400/30 dark:bg-violet-500/20 relative overflow-hidden" style={{ height: `${Math.max((count / max) * 120, count > 0 ? 6 : 2)}px` }}>
            <div className="absolute inset-0 bg-gradient-to-t from-violet-600 to-violet-400 dark:from-violet-500 dark:to-violet-300 opacity-80" />
          </div>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{day}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats>({
    usersCount: 0, threadsCount: 0, messagesCount: 0, onlineCount: 0, topUsers: [], weeklyMessages: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = () =>
      fetch("/api/admin/stats")
        .then(res => res.json())
        .then(data => {
          if (!data.error) setStats(data);
          setLoading(false);
        });

    fetchStats();
    // Refresh mỗi 30s để đồng bộ với heartbeat interval của client
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    { label: "Total Users", value: stats.usersCount, color: "violet", Icon: Users },
    { label: "Online Now", value: stats.onlineCount, color: "emerald", Icon: Wifi },
    { label: "Total Threads", value: stats.threadsCount, color: "blue", Icon: MessagesSquare },
    { label: "Total Messages", value: stats.messagesCount, color: "amber", Icon: MessageCircle },
  ];

  const colorMap: Record<string, string> = {
    violet: "from-violet-100 dark:from-violet-600/20 border-violet-200 dark:border-violet-500/30 text-violet-600 dark:text-violet-300 bg-violet-500/20 text-violet-400",
    emerald: "from-emerald-100 dark:from-emerald-600/20 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-300 bg-emerald-500/20 text-emerald-400",
    blue: "from-blue-100 dark:from-blue-600/20 border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-300 bg-blue-500/20 text-blue-400",
    amber: "from-amber-100 dark:from-amber-600/20 border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-300 bg-amber-500/20 text-amber-400",
  };

  return (
    <div className="max-w-6xl w-full mx-auto space-y-8 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1">Overview</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-base">Welcome to the MES Assistant administration panel.</p>
      </div>

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-2xl bg-zinc-200 dark:bg-white/5 border border-zinc-300 dark:border-white/10" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value, color, Icon }) => {
            const [gradFrom, gradBorder, labelColor, iconBg, iconColor] = colorMap[color].split(" ");
            return (
              <div key={label} className={`rounded-2xl bg-gradient-to-br ${gradFrom} to-transparent border ${gradBorder} p-5 flex items-center justify-between shadow-lg`}>
                <div>
                  <p className={`text-xs font-semibold ${labelColor} uppercase tracking-wider mb-1`}>{label}</p>
                  <h2 className="text-4xl font-bold text-zinc-900 dark:text-white">{value}</h2>
                </div>
                <div className={`h-12 w-12 rounded-xl ${iconBg} flex items-center justify-center ${iconColor}`}>
                  <Icon className="size-6" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Row: Chart + Top Users */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Weekly Messages Chart */}
        <div className="lg:col-span-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/5 p-6 shadow-xl">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Messages — Last 7 Days</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">User messages sent each day</p>
          </div>
          {loading ? (
            <div className="h-48 animate-pulse rounded-xl bg-zinc-200 dark:bg-white/5" />
          ) : stats.weeklyMessages.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-zinc-400 text-sm">Chưa có dữ liệu trong 7 ngày qua</div>
          ) : (
            <WeeklyBarChart data={stats.weeklyMessages} />
          )}
        </div>

        {/* Top 10 Users */}
        <div className="lg:col-span-2 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/5 p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="size-5 text-amber-500" />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Top 10 Active Users</h3>
          </div>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 rounded-lg bg-zinc-200 dark:bg-white/5" />)}
            </div>
          ) : stats.topUsers.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-zinc-400 text-sm">Chưa có dữ liệu</div>
          ) : (
            <ol className="space-y-2">
              {stats.topUsers.map((u, idx) => (
                <li key={u.email} className="flex items-center gap-3 py-1">
                  <span className={`text-sm font-bold w-5 text-right ${idx === 0 ? "text-amber-500" : idx === 1 ? "text-zinc-400" : idx === 2 ? "text-amber-700 dark:text-amber-600" : "text-zinc-400"}`}>
                    {idx + 1}
                  </span>
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={u.avatar || ""} />
                    <AvatarFallback className="bg-violet-900/50 text-violet-300 text-xs">
                      {(u.user_name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{u.user_name || "Unknown"}</p>
                    <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                  </div>
                  <span className="text-sm font-semibold text-violet-600 dark:text-violet-300 tabular-nums">{u.msg_count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
