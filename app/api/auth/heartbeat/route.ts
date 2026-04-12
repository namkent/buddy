import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { dbConnection } from "@/lib/db";

// Lightweight endpoint: called every 30s by the client to mark user as online
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const userId = (session.user as any).userId;
  if (userId) {
    // Fire-and-forget — never blocks the response
    dbConnection.users.updateLastActive(userId).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
