"use client";

import { signIn, getProviders } from "next-auth/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Provider {
  id: string;
  name: string;
  type: string;
}

// Icon cho Google
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

// Icon cho OIDC / SSO
function SsoIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export default function SignInPage() {
  const [providers, setProviders] = useState<Record<string, Provider>>({});
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [credUser, setCredUser] = useState("");
  const [credPass, setCredPass] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getProviders().then((p) => {
      if (p) setProviders(p as Record<string, Provider>);
    });
  }, []);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await signIn("credentials", { username: credUser, password: credPass, callbackUrl: "/" });
    setLoading(false);
  };

  const oauthProvider = Object.values(providers).find(
    (p) => p.type === "oauth" || p.type === "oidc"
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center relative overflow-hidden p-4">
      {/* Ambient glow blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30 mb-4">
            <span className="text-2xl">🤖</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">MES Buddy</h1>
          <p className="text-zinc-400 mt-1 text-sm">AI Assistant — Đăng nhập để tiếp tục</p>
        </div>

        {/* Glass Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/50 p-8">

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error === "OAuthAccountNotLinked"
                ? "Email đã được đăng ký với phương thức khác."
                : "Đăng nhập thất bại. Vui lòng thử lại."}
            </div>
          )}

          {/* OAuth / OIDC button */}
          {oauthProvider && (
            <>
              <button
                onClick={() => signIn(oauthProvider.id, { callbackUrl: "/" })}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/8 hover:bg-white/15 text-white py-3 px-5 font-medium transition-all duration-200 hover:shadow-lg hover:shadow-white/5 hover:scale-[1.01] active:scale-[0.99]"
              >
                {oauthProvider.id === "google" ? <GoogleIcon /> : <SsoIcon />}
                <span>Đăng nhập với {oauthProvider.name}</span>
              </button>

              <div className="my-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-zinc-500 uppercase tracking-wider">hoặc</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
            </>
          )}

          {/* Credentials form (Admin) */}
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">
                Đăng nhập bằng tài khoản
              </label>
              <input
                type="text"
                placeholder="Username"
                value={credUser}
                onChange={(e) => setCredUser(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 text-white placeholder-zinc-600 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Password"
                value={credPass}
                onChange={(e) => setCredPass(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 text-white placeholder-zinc-600 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !credUser || !credPass}
              className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white py-2.5 px-5 font-semibold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-violet-500/30 hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          MES Buddy © {new Date().getFullYear()} — Powered by AI
        </p>
      </div>
    </div>
  );
}
