"use client";

import { useEffect, useState } from "react";
import {
  Users, MessagesSquare, MessageCircle, Wifi, Trophy,
  ThumbsUp, ThumbsDown, MessageSquareQuote, CheckCircle2, XCircle
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface TopUser { user_name: string; email: string; avatar: string; msg_count: number }
interface WeeklyMsg { day_label: string; day_date: string; count: number }
interface RecentFeedback { id: string; content: string; feedback: number; user_name: string; email: string; created_at: string }
interface Stats {
  usersCount: number;
  threadsCount: number;
  messagesCount: number;
  onlineCount: number;
  posFeedbackCount: number;
  negFeedbackCount: number;
  topUsers: TopUser[];
  weeklyMessages: WeeklyMsg[];
  recentFeedbacks: RecentFeedback[];
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
    <div className="flex items-end gap-2 h-30 px-2 w-full">
      {filled.map(({ day, count }) => (
        <div key={day} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{count || ""}</span>
          <div className="w-full rounded-t-md bg-indigo-400/30 dark:bg-indigo-500/20 relative overflow-hidden" style={{ height: `${Math.max((count / max) * 120, count > 0 ? 6 : 2)}px` }}>
            <div className="absolute inset-0 bg-gradient-to-t from-indigo-600 to-indigo-400 dark:from-indigo-500 dark:to-indigo-300 opacity-80" />
          </div>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{day}</span>
        </div>
      ))}
    </div>
  );
}

function SatisfactionPieChart({ pos, neg }: { pos: number, neg: number }) {
  const total = pos + neg || 1;
  const posPer = Math.round((pos / total) * 100);
  const negPer = 100 - posPer;

  // SVG Pie chart logic
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const posOffset = circumference - (pos / total) * circumference;

  return (
    <div className="flex flex-col items-center gap-6 justify-center py-4 h-full">
      <div className="relative size-32 shrink-0">
        <svg className="size-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle (Negative) */}
          <circle
            cx="50" cy="50" r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="12"
            className="text-red-500/20"
          />
          {/* Positive segment */}
          <circle
            cx="50" cy="50" r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={posOffset}
            strokeLinecap="round"
            className="text-indigo-500 transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-zinc-900 dark:text-white">{posPer}%</span>
          <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-tighter">Happy</span>
        </div>
      </div>

      <div className="space-y-4 w-fit mx-auto px-2 pt-2">
        <div className="flex items-center gap-3">
          <div className="size-3 rounded-full bg-indigo-500" />
          <div className="flex flex-row select-none">
            <span className="text-sm font-bold text-zinc-900 dark:text-white uppercase leading-none mr-2">{pos}</span>
            <span className="text-sm font-bold text-zinc-500 uppercase leading-none">Positive</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="size-3 rounded-full bg-red-500/30" />
          <div className="flex flex-row select-none">
            <span className="text-sm font-bold text-zinc-900 dark:text-white uppercase leading-none mr-2">{neg}</span>
            <span className="text-sm font-bold text-zinc-500 uppercase leading-none">Negative</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const formatContent = (content: string) => {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.filter(p => p.type === 'text').map(p => p.text).join(' ');
    }
  } catch (e) { /* return as is */ }
  return content;
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats>({
    usersCount: 0, threadsCount: 0, messagesCount: 0, onlineCount: 0,
    posFeedbackCount: 0, negFeedbackCount: 0,
    topUsers: [], weeklyMessages: [], recentFeedbacks: []
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
    { label: "Total Users", value: stats.usersCount, color: "indigo_primary", Icon: Users },
    { label: "Online Now", value: stats.onlineCount, color: "green", Icon: Wifi },
    { label: "Total Threads", value: stats.threadsCount, color: "blue", Icon: MessagesSquare },
    { label: "Total Messages", value: stats.messagesCount, color: "amber", Icon: MessageCircle },
  ];

  const colorMap: Record<string, string> = {
    indigo_primary: "from-indigo-100 dark:from-indigo-600/20 border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-300 bg-indigo-500/20 text-indigo-400",
    green: "from-emerald-100 dark:from-emerald-600/20 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-300 bg-emerald-500/20 text-emerald-400",
    blue: "from-blue-100 dark:from-blue-600/20 border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-300 bg-blue-500/20 text-blue-400",
    amber: "from-amber-100 dark:from-amber-600/20 border-amber-200 dark:border-amber-500/30 text-amber-600 dark:text-amber-300 bg-amber-500/20 text-amber-400",
  };

  return (
    <div className="max-w-[1600px] w-full mx-auto flex flex-col h-[calc(100dvh-10rem)] gap-6 p-1 overflow-hidden">

      {/* Header Area (Full Width) */}
      <div className="shrink-0">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1">Overview</h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-base">Welcome to the MES Assistant administration panel.</p>
      </div>

      {/* Main Body Area */}
      <div className="flex-1 flex flex-row gap-4 min-h-0">

        {/* Left Column (75%) */}
        <div className="flex-[3] flex flex-col gap-4 min-h-0">

          {/* Stat Cards Grid (Reverted to old stats) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
            {loading ? (
              [1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-2xl bg-zinc-200 dark:bg-white/5 border border-zinc-300 dark:border-white/10 animate-pulse" />)
            ) : (
              statCards.map(({ label, value, color, Icon }) => {
                const [gradFrom, gradBorder, labelColor, iconBg, iconColor] = colorMap[color].split(" ");
                return (
                  <div key={label} className={`rounded-xl bg-gradient-to-br ${gradFrom} to-transparent border ${gradBorder} p-5 flex items-center justify-between shadow-sm`}>
                    <div>
                      <p className={`text-sm font-semibold ${labelColor} uppercase tracking-wider mb-1`}>{label}</p>
                      <h2 className="text-3xl font-bold text-zinc-900 dark:text-white">{value}</h2>
                    </div>
                    <div className={`h-11 w-11 rounded-xl ${iconBg} flex items-center justify-center ${iconColor}`}>
                      <Icon className="size-5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Region: Satisfaction (1/4) / Feedbacks (3/4) aligned with Stat Cards Grid */}
          <div className="flex-1 grid grid-cols-4 gap-4 min-h-0">
            {/* User Satisfaction (Aligned with 1st Stat Card) */}
            <div className="col-span-1 flex flex-col min-h-0">
              <Card className="shadow-sm border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-xl h-full flex flex-col overflow-hidden">
                <CardHeader className="shrink-0">
                  <CardTitle className="text-lg">Satisfaction</CardTitle>
                  <CardDescription className="text-xs">User reactions</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 pb-4 flex flex-col min-h-0">
                  {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="size-32 animate-pulse rounded-full bg-zinc-200 dark:bg-white/5" />
                    </div>
                  ) : (
                    <SatisfactionPieChart pos={stats.posFeedbackCount} neg={stats.negFeedbackCount} />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Feedbacks (Aligned with Cards 2, 3, 4) */}
            <div className="col-span-3 flex flex-col min-h-0">
              <Card className="shadow-sm border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-xl flex flex-col h-full min-h-0">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 shrink-0">
                  <div className="flex items-center gap-2">
                    <MessageSquareQuote className="size-5 text-indigo-500" />
                    <CardTitle className="text-lg">Recent Feedbacks</CardTitle>
                  </div>
                  {stats.recentFeedbacks.length > 0 && (
                    <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-600 border-none font-bold text-sm">Latest 10</Badge>
                  )}
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                  {loading ? (
                    <div className="space-y-4 animate-pulse">
                      {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-zinc-200 dark:bg-white/5" />)}
                    </div>
                  ) : stats.recentFeedbacks.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-zinc-400 text-sm italic py-10">Chưa có phản hồi</div>
                  ) : (
                    <div className="space-y-3 pb-2">
                      {stats.recentFeedbacks.map(f => (
                        <div key={f.id} className="flex gap-4 items-start p-4 rounded-xl bg-zinc-50/50 dark:bg-white/5 border border-zinc-100/50 dark:border-white/5 hover:border-indigo-500/30 transition-colors group">
                          <div className={cn(
                            "p-2.5 rounded-xl shrink-0 shadow-sm transition-transform group-hover:scale-110",
                            f.feedback === 1 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
                          )}>
                            {f.feedback === 1 ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[14px] font-bold text-zinc-900 dark:text-white truncate">{f.user_name || "Unknown"}</span>
                              <Badge variant="secondary" className="text-[12px] px-1.5 py-0 bg-zinc-200 dark:bg-zinc-800 text-zinc-500 border-none font-bold">
                                {new Date(f.created_at).toLocaleDateString()}
                              </Badge>
                            </div>
                            <div className="relative">
                              <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">
                                "{formatContent(f.content)}"
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Right Column (25%) */}
        <div className="flex-[1] flex flex-col gap-4 min-h-0">

          {/* Top 5 Active Users (Full height/Expanding) */}
          <Card className="shadow-sm border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-xl flex flex-col flex-1 min-h-0">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 shrink-0">
              <Trophy className="size-5 text-amber-500" />
              <CardTitle className="text-lg font-bold">Top 5 Active Users</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto pr-6">
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 rounded-lg bg-zinc-200 dark:bg-white/5" />)}
                </div>
              ) : stats.topUsers.length === 0 ? (
                <div className="flex items-center justify-center h-full text-zinc-400 text-sm">No</div>
              ) : (
                <ol className="space-y-1">
                  {stats.topUsers.map((u, idx) => (
                    <li key={u.email} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors group">
                      <span className={cn("text-sm font-bold w-5 text-center shrink-0 transition-colors", idx === 0 ? "text-amber-500" : idx === 1 ? "text-zinc-400" : idx === 2 ? "text-amber-700 dark:text-amber-600" : "text-zinc-400")}>
                        {idx + 1}
                      </span>
                      <Avatar className="h-9 w-9 shrink-0 border border-zinc-200 dark:border-white/5 transition-transform group-hover:scale-110">
                        <AvatarImage src={u.avatar || ""} />
                        <AvatarFallback className="bg-indigo-500 text-white font-bold text-xs uppercase">
                          {(u.user_name || "U").charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-900 dark:text-white truncate leading-none mb-1.5">{u.user_name || "Unknown"}</p>
                        <p className="text-xs text-zinc-500 truncate">{u.email}</p>
                      </div>
                      <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-600 border-none tabular-nums font-bold text-sm h-7 px-2">
                        {u.msg_count}
                      </Badge>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Activity Chart (Bottom Region) */}
          <Card className="shadow-sm border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-xl flex flex-col shrink-0">
            <CardHeader>
              <CardTitle className="text-lg">Activity</CardTitle>
              <CardDescription className="text-xs">Last 7 days</CardDescription>
            </CardHeader>
            <CardContent className="h-[180px] flex flex-col justify-end pb-1 overflow-hidden">
              {loading ? (
                <div className="h-full animate-pulse rounded-xl bg-zinc-200 dark:bg-white/5" />
              ) : stats.weeklyMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-400 text-xs italic">No activity</div>
              ) : (
                <WeeklyBarChart data={stats.weeklyMessages} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
