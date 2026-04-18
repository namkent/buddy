import { NextResponse } from 'next/server';
import { dbConnection, pool } from '@/lib/db';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import path from 'path';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const fileId = parseInt(id);

    // 1. Lấy thông tin file từ DB
    const res = await pool.query('SELECT * FROM knowledge_files WHERE id = $1', [fileId]);
    const file = res.rows[0];

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 2. Cập nhật trạng thái về pending
    await dbConnection.knowledge.updateFileStatus(fileId, 'pending', null);

    // 3. Reconstruct absolute path
    const storageRoot = process.env.EXTERNAL_STORAGE_PATH || path.join(process.cwd(), 'external_storage');
    // file_path trong DB có dạng /group_1/file_5/origin/hash.pdf
    const physicalPath = path.join(storageRoot, file.file_path);

    // 4. Gọi Python xử lý
    const pythonUrl = process.env.RAG_SERVICE_URL || "http://localhost:8000";
    
    // Gửi yêu cầu bất đồng bộ
    fetch(`${pythonUrl}/rag/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        file_id: file.id, 
        group_id: file.group_id,
        file_path: physicalPath
      })
    }).catch(err => {
        console.error("Retry RAG Fail:", err);
        dbConnection.knowledge.updateFileStatus(file.id, "error_triggering", err.message);
    });

    // 5. Ghi Log
    await dbConnection.logs.create({
        user_id: (session.user as any).userId,
        level: 'info',
        source: 'knowledge_base',
        message: `Kích hoạt lại xử lý RAG cho tài liệu: ${file.file_name} (ID: ${fileId})`,
        details: JSON.stringify({ file_id: fileId, group_id: file.group_id })
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
