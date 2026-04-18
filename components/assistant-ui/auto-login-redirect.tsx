"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Component xử lý tự động chuyển hướng sang trang đăng nhập OIDC 
 * nếu chưa có session và tính năng được bật trong .env
 */
export function AutoLoginRedirect() {
  const { status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    // Chỉ thực hiện nếu tính năng được bật là 'true'
    const isAutoLoginEnabled = process.env.NEXT_PUBLIC_AUTO_LOGIN_OIDC === "true";
    
    // Tránh vòng lặp vô hạn: Không redirect nếu đang ở trang login
    const isNotLoginPage = pathname !== "/auth/signin";

    if (status === "unauthenticated" && isAutoLoginEnabled && isNotLoginPage) {
      console.log("[AutoLogin] Unauthenticated session detected. Redirecting to OIDC provider...");
      // 'oidc' là ID của provider được cấu hình trong [...nextauth]/route.ts
      signIn("oidc", { callbackUrl: window.location.href });
    }
  }, [status, pathname]);

  return null;
}
