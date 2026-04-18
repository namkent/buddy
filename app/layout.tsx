import type { Metadata } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "@/components/assistant-ui/session-provider";
import { AutoLoginRedirect } from "@/components/assistant-ui/auto-login-redirect";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { HeartbeatProvider } from "@/components/assistant-ui/heartbeat-provider";
import { Toaster } from "sonner";
import "./globals.css";
import "katex/dist/katex.min.css";

const GoogleSans = localFont({
  src: "../public/fonts/GoogleSans.ttf",
  variable: "--font-sans",
  weight: "100 1000",
});

const GoogleSansFlex = localFont({
  src: "../public/fonts/GoogleSansFlex.ttf",
  variable: "--font-sans-flex",
  weight: "100 1000",
});

const GoogleSansCode = localFont({
  src: "../public/fonts/GoogleSansCode.ttf",
  variable: "--font-sans-code",
  weight: "100 1000",
});

export const metadata: Metadata = {
  title: "MES Assistant",
  description: "MES Chat Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GoogleSans.variable} ${GoogleSansFlex.variable} ${GoogleSansCode.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <AutoLoginRedirect />
            <HeartbeatProvider />
            <TooltipProvider>{children}</TooltipProvider>
          </AuthProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
