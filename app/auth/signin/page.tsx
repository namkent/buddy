"use client";

import { signIn, getProviders } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/assistant-ui/theme-toggle";

interface Provider {
  id: string;
  name: string;
  type: string;
}

function SignInContent() {
  const [providers, setProviders] = useState<Record<string, Provider>>({});
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  const [view, setView] = useState<"login" | "register" | "changepass">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    getProviders().then((p) => {
      if (p) setProviders(p as Record<string, Provider>);
    });
    if (errorParam) {
      setMsg({ type: "error", text: errorParam === "OAuthAccountNotLinked" ? "Email đã được gắn với phương thức đăng nhập khác." : "Đăng nhập thất bại. Vui lòng thử lại." });
    }
  }, [errorParam]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    const res = await signIn("credentials", { username: email, password, redirect: false });
    if (res?.error) {
      setMsg({ type: "error", text: "Email hoặc mật khẩu không chính xác." });
      setLoading(false);
    } else {
      window.location.href = "/";
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (data.error) {
        setMsg({ type: "error", text: data.error });
      } else {
        setMsg({ type: "success", text: "Đăng ký thành công! Vui lòng đăng nhập." });
        setView("login");
        setPassword("");
      }
    } catch {
      setMsg({ type: "error", text: "Có lỗi xảy ra, vui lòng thử lại." });
    }
    setLoading(false);
  };

  const handleChangePass = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, oldPassword, newPassword: password })
      });
      const data = await res.json();
      if (data.error) {
        setMsg({ type: "error", text: data.error });
      } else {
        setMsg({ type: "success", text: "Đổi mật khẩu thành công! Bạn có thể đăng nhập ngay." });
        setView("login");
        setPassword("");
        setOldPassword("");
      }
    } catch {
      setMsg({ type: "error", text: "Có lỗi xảy ra" });
    }
    setLoading(false);
  };

  const oauthProviders = Object.values(providers).filter(
    (p) => p.type === "oauth" || p.type === "oidc"
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] flex items-center justify-center relative overflow-hidden p-4 transition-colors duration-500">

      {/* Theme Toggle ở góc */}
      <div className="absolute top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* Ambient glow blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/10 dark:bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 dark:bg-blue-600/15 rounded-full blur-[120px] pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">

        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/30 mb-4">
            <span className="text-2xl">🤖</span>
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">MES Assistant</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">Hệ thống trợ lý AI</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-zinc-200/50 dark:bg-zinc-800/50 rounded-xl p-1 mb-6 backdrop-blur-sm shadow-inner">
          <button
            onClick={() => { setView("login"); setMsg({ type: "", text: "" }); }}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${view === "login" ? "bg-white dark:bg-zinc-700 shadow text-indigo-600 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"}`}
          >Đăng Nhập</button>
          <button
            onClick={() => { setView("register"); setMsg({ type: "", text: "" }); }}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${view === "register" ? "bg-white dark:bg-zinc-700 shadow text-indigo-600 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"}`}
          >Đăng Ký</button>
          <button
            onClick={() => { setView("changepass"); setMsg({ type: "", text: "" }); }}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${view === "changepass" ? "bg-white dark:bg-zinc-700 shadow text-indigo-600 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"}`}
          >Đổi Pass</button>
        </div>

        {/* Glass Card */}
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/5 dark:shadow-black/50 p-8">

          {/* System Messages */}
          {msg.text && (
            <div className={`mb-6 rounded-lg border px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 ${msg.type === "success"
              ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400"
              : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400"
              }`}>
              {msg.text}
            </div>
          )}

          {/* VIEW: LOGIN */}
          {view === "login" && (
            <>
              {oauthProviders.length > 0 && (
                <>
                  <div className="flex flex-col gap-3">
                    {oauthProviders.map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => signIn(provider.id, { callbackUrl: "/" })}
                        className="w-full flex items-center justify-center gap-3 rounded-xl border border-zinc-300 dark:border-white/10 bg-zinc-50 hover:bg-zinc-100 dark:bg-white/8 dark:hover:bg-white/15 text-zinc-700 dark:text-white py-3 px-5 font-medium transition-all duration-200 hover:shadow-md"
                      >
                        <span>Đăng nhập với {provider.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="my-6 flex items-center gap-3">
                    <div className="flex-1 h-px bg-zinc-300 dark:bg-white/10" />
                    <span className="text-xs text-zinc-400 uppercase tracking-wider">hoặc email</span>
                    <div className="flex-1 h-px bg-zinc-300 dark:bg-white/10" />
                  </div>
                </>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required
                    className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-5 font-semibold text-sm transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50"
                >
                  {loading ? "Đang xử lý..." : "Đăng nhập"}
                </button>
              </form>
            </>
          )}

          {/* VIEW: REGISTER */}
          {view === "register" && (
            <form onSubmit={handleRegister} className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div>
                <input type="text" placeholder="Họ và tên" value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <input type="email" placeholder="Email đăng nhập" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <input type="password" placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={5}
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <button type="submit" disabled={loading}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-5 font-semibold text-sm transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 mt-2"
              >
                {loading ? "Đang xử lý..." : "Đăng ký tài khoản"}
              </button>
            </form>
          )}

          {/* VIEW: CHANGE PASSWORD */}
          {view === "changepass" && (
            <form onSubmit={handleChangePass} className="space-y-4 animate-in fade-in slide-in-from-left-4">
              <div>
                <input type="email" placeholder="Email tài khoản" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <input type="password" placeholder="Mật khẩu hiện tại (Bỏ trống nếu tạo lần đầu bằng SSO)" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <input type="password" placeholder="Mật khẩu mới" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={5}
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <button type="submit" disabled={loading}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-5 font-semibold text-sm transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 mt-2"
              >
                {loading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
              </button>
            </form>
          )}

        </div>

        <p className="flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-600 mt-6">
          MES Assistant©{new Date().getFullYear()} — Powered by Namkent
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Đang tải...</div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
