import { NextResponse } from 'next/server';
import { dbConnection } from '@/lib/db';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const groupId = parseInt(id);
    const body = await req.json();
    await dbConnection.knowledge.updateGroup(groupId, body);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const groupId = parseInt(id);

    // Call Python backend to delete all vectors and files in this group
    try {
      const pythonUrl = process.env.RAG_SERVICE_URL || "http://localhost:8000";
      await fetch(`${pythonUrl}/rag/delete_group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId })
      });
    } catch (err) {
      console.warn(`Failed to contact python RAG delete_group for group ${groupId}. Proceeding with DB delete.`, err);
    }

    await dbConnection.knowledge.deleteGroup(groupId);

    // Log action
    await dbConnection.logs.create({
      user_id: (session.user as any).userId,
      level: 'warn',
      source: 'knowledge_base',
      message: `Permanently deleted knowledge category ID: ${groupId}`
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
