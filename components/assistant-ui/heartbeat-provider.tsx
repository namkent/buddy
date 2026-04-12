"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 30_000; // mỗi 30 giây

export function HeartbeatProvider() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session) return;

    // Ping ngay khi mount (tab mở/focus)
    const ping = () => fetch("/api/auth/heartbeat").catch(() => {});
    ping();

    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session]);

  return null; // purely side-effect component
}
