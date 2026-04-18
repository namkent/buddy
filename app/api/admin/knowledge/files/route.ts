import { NextResponse } from 'next/server';
import { dbConnection } from '@/lib/db';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const groupIdStr = formData.get("groupId") as string;

    if (!file || !groupIdStr) {
      return NextResponse.json({ error: "File and groupId are required" }, { status: 400 });
    }

    const groupId = parseInt(groupIdStr);

    // Get storage config from .env
    const storagePath = process.env.EXTERNAL_STORAGE_PATH || path.join(process.cwd(), 'external_storage');
    const fileServerUrl = process.env.FILE_SERVER_URL || "";

    // Insert to DB first as pending to get file_id (we need it for the path)
    // Actually we can just add a temporary entry or use a random ID.
    // Let's use Date.now() for the file folder name to keep it unique even before DB insert, 
    // or insert to DB first.
    const dbFile = await dbConnection.knowledge.addFile(groupId, file.name, "pending");

    // Create path: group_{G}/file_{F}/origin/
    const fileFolder = path.join(storagePath, `group_${groupId}`, `file_${dbFile.id}`);
    const originFolder = path.join(fileFolder, 'origin');
    
    if (!fs.existsSync(originFolder)) {
      fs.mkdirSync(originFolder, { recursive: true });
    }

    // Obfuscate filename: use a random hex string or uuid
    const ext = path.extname(file.name);
    const obfuscatedName = `${require('crypto').randomBytes(16).toString('hex')}${ext}`;
    const filePath = path.join(originFolder, obfuscatedName);

    // file_url for public access via Nginx
    // e.g. /group_1/file_5/origin/hash.pdf
    const fileUrlPath = `/group_${groupId}/file_${dbFile.id}/origin/${obfuscatedName}`;

    // Write file to external storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    // Update DB with the correct path and status
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
        file_path: filePath // Send absolute path to Python
      })
    }).catch(err => {
      console.error("Failed to trigger python RAG process:", err);
      dbConnection.knowledge.updateFileStatus(dbFile.id, "error_triggering");
    });

    // Log action
    await dbConnection.logs.create({
        user_id: (session.user as any).userId,
        level: 'info',
        source: 'knowledge_base',
        message: `Uploaded document: ${file.name} (Size: ${(file.size / 1024).toFixed(1)} KB)`,
        details: JSON.stringify({ file_id: dbFile.id, group_id: groupId, file_path: fileUrlPath })
    });

    return NextResponse.json({ file: dbFile });
  } catch (error: any) {
    console.error("Upload error:", error);
    // Log error
    await dbConnection.logs.create({
        user_id: (session.user as any).userId,
        level: 'error',
        source: 'knowledge_base',
        message: `Error uploading document: ${error.message}`,
        details: error.stack
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Need to import pool for the manual update above
import { pool } from '@/lib/db';

