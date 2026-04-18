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
    const fileId = parseInt(id);
    const body = await req.json();
    await dbConnection.knowledge.updateFile(fileId, body);

    // Log action
    await dbConnection.logs.create({
      user_id: (session.user as any).userId,
      level: 'info',
      source: 'knowledge_base',
      message: `Updated document information for ID: ${fileId}`,
      details: JSON.stringify(body)
    });

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
    const fileId = parseInt(id);

    // Call Python backend to delete vectors
    try {
      const pythonUrl = process.env.RAG_SERVICE_URL || "http://localhost:8000";
      await fetch(`${pythonUrl}/rag/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId })
      });
    } catch (err) {
      console.warn("Failed to contact python RAG delete. Proceeding anyway.", err);
    }

    // Delete DB record
    await dbConnection.knowledge.deleteFile(fileId);
    
    // Log action
    await dbConnection.logs.create({
      user_id: (session.user as any).userId,
      level: 'warn',
      source: 'knowledge_base',
      message: `Permanently deleted document file ID: ${fileId}`
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
