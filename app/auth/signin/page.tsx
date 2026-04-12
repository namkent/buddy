"use client";

import { signIn, getProviders } from "next-auth/react";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/assistant-ui/theme-toggle";

interface Provider {
  id: string;
  name: string;
  type: string;
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function SsoIcon() {
  return (
    <svg className="w-5 h-5 text-current" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export default function SignInPage() {
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
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-600/10 dark:bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 dark:bg-blue-600/15 rounded-full blur-[120px] pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30 mb-4">
            <span className="text-2xl">🤖</span>
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">MES Buddy</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">Hệ thống trợ lý nâng cao</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-zinc-200/50 dark:bg-zinc-800/50 rounded-xl p-1 mb-6 backdrop-blur-sm shadow-inner">
          <button 
            onClick={() => { setView("login"); setMsg({ type:"", text:"" }); }}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${view === "login" ? "bg-white dark:bg-zinc-700 shadow text-violet-600 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"}`}
          >Đăng Nhập</button>
          <button 
            onClick={() => { setView("register"); setMsg({ type:"", text:"" }); }}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${view === "register" ? "bg-white dark:bg-zinc-700 shadow text-violet-600 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"}`}
          >Đăng Ký</button>
          <button 
            onClick={() => { setView("changepass"); setMsg({ type:"", text:"" }); }}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${view === "changepass" ? "bg-white dark:bg-zinc-700 shadow text-violet-600 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white"}`}
          >Đổi Pass</button>
        </div>

        {/* Glass Card */}
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/5 dark:shadow-black/50 p-8">

          {/* System Messages */}
          {msg.text && (
            <div className={`mb-6 rounded-lg border px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 ${
              msg.type === "success" 
              ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
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
                        {provider.id === "google" ? <GoogleIcon /> : <SsoIcon />}
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
                    className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <div>
                  <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required
                    className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white py-2.5 px-5 font-semibold text-sm transition-all shadow-lg shadow-violet-500/30 disabled:opacity-50"
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
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <div>
                <input type="email" placeholder="Email đăng nhập" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <div>
                <input type="password" placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={5}
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <button type="submit" disabled={loading}
                className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white py-2.5 px-5 font-semibold text-sm transition-all shadow-lg shadow-violet-500/30 disabled:opacity-50 mt-2"
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
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <div>
                <input type="password" placeholder="Mật khẩu hiện tại (Bỏ trống nếu tạo lần đầu bằng SSO)" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <div>
                <input type="password" placeholder="Mật khẩu mới" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={5}
                  className="w-full rounded-xl border border-zinc-300 dark:border-white/10 bg-transparent text-zinc-900 dark:text-white placeholder-zinc-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
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

        <p className="text-center text-xs text-zinc-500 dark:text-zinc-600 mt-6">
          MES Buddy © {new Date().getFullYear()} — Powered by AI
        </p>
      </div>
    </div>
  );
}
