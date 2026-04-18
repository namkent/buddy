import { NextResponse } from 'next/server';
import { dbConnection } from '@/lib/db';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const pythonUrl = process.env.RAG_SERVICE_URL || "http://localhost:8000";
    const res = await fetch(`${pythonUrl}/rag/sync`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "RAG Sync failed");

    // Log the action
    await dbConnection.logs.create({
      user_id: (session.user as any).userId,
      level: 'info',
      source: 'knowledge_base',
      message: `Database synchronization completed. Valid documents: ${data.valid_count}`,
      details: JSON.stringify(data)
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
