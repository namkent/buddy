import { NextResponse } from 'next/server';
import { dbConnection, pool } from '@/lib/db';
import { requireAdmin, errorResponse, successResponse, logAdminAction } from "@/lib/api-utils";
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * [POST] Lưu nội dung soạn thảo trực tiếp thành tài liệu kiến thức (HTML)
 * Quy trình: Tạo file vật lý từ content -> Lưu DB -> Trigger AI xử lý
 */
export async function POST(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  try {
    const { title, content, groupId } = await req.json();

    if (!title || !content || !groupId) {
      return errorResponse("Tiêu đề, nội dung và mã nhóm là bắt buộc", 400);
    }

    // Cấu hình đường dẫn lưu trữ
    const storagePath = process.env.EXTERNAL_STORAGE_PATH || path.join(process.cwd(), 'external_storage');

    // 1. Khởi tạo bản ghi tệp với đuôi .html
    const dbFile = await dbConnection.knowledge.addFile(groupId, title + ".html", "pending");

    // 2. Chuẩn bị cấu trúc thư mục
    const fileFolder = path.join(storagePath, `group_${groupId}`, `file_${dbFile.id}`);
    const originFolder = path.join(fileFolder, 'origin');
    
    if (!fs.existsSync(originFolder)) {
      fs.mkdirSync(originFolder, { recursive: true });
    }

    // 3. Tạo tên file ngẫu nhiên bảo mật
    const obfuscatedName = `${crypto.randomBytes(16).toString('hex')}.html`;
    const physicalPath = path.join(originFolder, obfuscatedName);

    // 4. Ghi nội dung văn bản vào tệp vật lý
    fs.writeFileSync(physicalPath, content, 'utf-8');

    // Đường dẫn truy cập công cộng
    const fileUrlPath = `/group_${groupId}/file_${dbFile.id}/origin/${obfuscatedName}`;

    // 5. Cập nhật URL vào DB
    await pool.query('UPDATE knowledge_files SET file_path = $1 WHERE id = $2', [fileUrlPath, dbFile.id]);
    dbFile.file_path = fileUrlPath;

    // 6. Kích hoạt bộ xử lý RAG (Python Service)
    const pythonUrl = process.env.RAG_SERVICE_URL || "http://localhost:8000";
    fetch(`${pythonUrl}/rag/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        file_id: dbFile.id, 
        group_id: groupId,
        file_path: physicalPath,
        file_name: title + ".html"
      })
    }).catch(err => {
      console.error("Trigger Python RAG fail:", err);
      dbConnection.knowledge.updateFileStatus(dbFile.id, "error_triggering");
    });

    // 7. Ghi Log hành động
    await logAdminAction(admin!.userId, 'knowledge_base', `Đã tạo tài liệu mới từ trình soạn thảo: ${title}`, { file_id: dbFile.id });

    return successResponse({ file: dbFile });

  } catch (error: any) {
    console.error("Content save error:", error);
    return errorResponse("Lỗi hệ thống khi lưu nội dung", 500);
  }
}
