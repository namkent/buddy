import { NextResponse } from 'next/server';
import { dbConnection, pool } from '@/lib/db';
import { requireAdmin, errorResponse, successResponse, logAdminAction } from "@/lib/api-utils";
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * [POST] Tải tài liệu lên thư viện kiến thức
 * Quy trình: Lưu DB tạm -> Lưu file gốc -> Cập nhật URL -> Gọi Python xử lý RAG
 */
export async function POST(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const groupIdStr = formData.get("groupId") as string;

    if (!file || !groupIdStr) {
      return errorResponse("Thiếu file tải lên hoặc mã nhóm (groupId)", 400);
    }

    const groupId = parseInt(groupIdStr);

    // Cấu hình đường dẫn lưu trữ từ môi trường
    const storagePath = process.env.EXTERNAL_STORAGE_PATH || path.join(/*turbopackIgnore: true*/ process.cwd(), 'external_storage');
    
    // 1. Khởi tạo bản ghi tệp trong DB với trạng thái 'pending'
    const dbFile = await dbConnection.knowledge.addFile(groupId, file.name, "pending", file.size);

    // 2. Chuẩn bị thư mục lưu trữ: group_{G}/file_{F}/origin/
    const fileFolder = path.join(/*turbopackIgnore: true*/ storagePath, `group_${groupId}`, `file_${dbFile.id}`);
    const originFolder = path.join(/*turbopackIgnore: true*/ fileFolder, 'origin');
    
    if (!fs.existsSync(originFolder)) {
      fs.mkdirSync(originFolder, { recursive: true });
    }

    // 3. Xử lý tên tệp (Obfuscate) để tăng tính bảo mật và tránh trùng lặp
    const ext = path.extname(file.name);
    const obfuscatedName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    const physicalPath = path.join(/*turbopackIgnore: true*/ originFolder, obfuscatedName);

    // Đường dẫn URL để truy cập công cộng (thông qua Nginx/File Server)
    const fileUrlPath = `/group_${groupId}/file_${dbFile.id}/origin/${obfuscatedName}`;

    // 4. Ghi tệp vật lý vào ổ đĩa
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(physicalPath, buffer);

    // 5. Cập nhật đường dẫn URL vào Database
    await pool.query('UPDATE knowledge_files SET file_path = $1 WHERE id = $2', [fileUrlPath, dbFile.id]);
    dbFile.file_path = fileUrlPath;

    // 6. Kích hoạt bộ xử lý RAG (Python Service) không đồng bộ
    const pythonUrl = process.env.RAG_SERVICE_URL || "http://localhost:8000";
    fetch(`${pythonUrl}/rag/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        file_id: dbFile.id, 
        group_id: groupId,
        file_path: physicalPath, 
        file_name: file.name
      })
    }).catch(err => {
      console.error("Trigger Python RAG fail:", err);
      dbConnection.knowledge.updateFileStatus(dbFile.id, "error_triggering");
    });

    // 7. Ghi Log hành động upload
    await logAdminAction(admin!.userId, 'knowledge_base', `Đã tải lên tài liệu: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`, {
      file_id: dbFile.id,
      group_id: groupId,
      file_path: fileUrlPath
    });

    return successResponse({ file: dbFile });

  } catch (error: any) {
    console.error("Upload process error:", error);
    
    // Ghi log lỗi hệ thống
    await dbConnection.logs.create({
        user_id: admin!.userId,
        level: 'error',
        source: 'knowledge_base',
        message: `Lỗi khi tải tài liệu lên: ${error.message}`,
        details: error.stack
    });

    return errorResponse("Lỗi hệ thống khi xử lý tệp", 500);
  }
}

