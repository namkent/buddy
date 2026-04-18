import { NextResponse } from 'next/server';
import { dbConnection, pool } from '@/lib/db';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { title, content, groupId } = await req.json();

    if (!title || !content || !groupId) {
      return NextResponse.json({ error: "Title, content and groupId are required" }, { status: 400 });
    }

    // Get storage config from .env
    const storagePath = process.env.EXTERNAL_STORAGE_PATH || path.join(process.cwd(), 'external_storage');
    const fileServerUrl = process.env.FILE_SERVER_URL || "";

    // Insert to DB as pending
    const dbFile = await dbConnection.knowledge.addFile(groupId, title + ".html", "pending");

    // Create folder structure
    const fileFolder = path.join(storagePath, `group_${groupId}`, `file_${dbFile.id}`);
    const originFolder = path.join(fileFolder, 'origin');
    
    if (!fs.existsSync(originFolder)) {
      fs.mkdirSync(originFolder, { recursive: true });
    }

    // Create filename
    const obfuscatedName = `${crypto.randomBytes(16).toString('hex')}.html`;
    const filePath = path.join(originFolder, obfuscatedName);

    // Save content to file
    fs.writeFileSync(filePath, content, 'utf-8');

    // file_url for public access
    const fileUrlPath = `/group_${groupId}/file_${dbFile.id}/origin/${obfuscatedName}`;

    // Update DB
    await pool.query('UPDATE knowledge_files SET file_path = $1 WHERE id = $2', [fileUrlPath, dbFile.id]);
    dbFile.file_path = fileUrlPath;

    // Trigger Python processing async
    const pythonUrl = process.env.RAG_SERVICE_URL || "http://localhost:8000";
    fetch(`${pythonUrl}/rag/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        file_id: dbFile.id, 
        group_id: groupId,
        file_path: filePath 
      })
    }).catch(err => {
      console.error("Failed to trigger python RAG process:", err);
      dbConnection.knowledge.updateFileStatus(dbFile.id, "error_triggering");
    });

    return NextResponse.json({ file: dbFile });
  } catch (error: any) {
    console.error("Content save error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
