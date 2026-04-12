import type { Metadata } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "@/components/assistant-ui/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

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
    <html lang="en">
      <body
        className={`${GoogleSans.variable} ${GoogleSansFlex.variable} ${GoogleSansCode.variable} antialiased`}
      >
        <AuthProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
