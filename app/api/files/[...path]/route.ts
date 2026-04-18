import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAuth, errorResponse } from "@/lib/api-utils";

/**
 * [GET] API Trung tâm phục vụ các tệp tin từ Storage ngoài (External Storage)
 * Bảo mật: Chỉ người dùng đã đăng nhập mới có thể truy cập
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // 1. Xác thực người dùng (Session Required)
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const { path: pathSegments } = await params;
    
    // 2. Lấy đường dẫn gốc (Root) của storage từ biến môi trường
    const storageRoot = process.env.EXTERNAL_STORAGE_PATH || path.join(process.cwd(), 'external_storage');
    
    // 3. Xây dựng đường dẫn vật lý an toàn và chuẩn hóa
    const relativePath = path.join(...pathSegments);
    const safePhysicalPath = path.normalize(path.join(storageRoot, relativePath));

    // 4. Bảo mật: Chống tấn công Directory Traversal (Đảm bảo file nằm trong thư mục gốc cho phép)
    if (!safePhysicalPath.startsWith(path.normalize(storageRoot))) {
      return errorResponse("Bạn không có quyền truy cập vào thư mục này", 403);
    }

    // 5. Kiểm tra tệp tin có tồn tại không
    if (!fs.existsSync(safePhysicalPath) || fs.lstatSync(safePhysicalPath).isDirectory()) {
      return errorResponse("Tệp tin không tồn tại", 404);
    }

    // 6. Tự động xác định Content-Type dựa trên đuôi tệp
    const ext = path.extname(safePhysicalPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.html': 'text/html; charset=utf-8',
      '.htm': 'text/html; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.txt': 'text/plain; charset=utf-8',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
    };
    
    const contentType = mimeMap[ext] || 'application/octet-stream';

    // 7. Stream tệp tin về Client để tối ưu bộ nhớ
    const fileStream = fs.createReadStream(safePhysicalPath);
    
    // Chuyển đổi định dạng Node.js stream sang Web stream (Tương thích Edge Runtime)
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk));
        fileStream.on('end', () => controller.close());
        fileStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cho phép cache trình duyệt trong 1 giờ
      },
    });

  } catch (error: any) {
    console.error("File distribution error:", error);
    return errorResponse("Lỗi hệ thống khi tải tệp tin", 500);
  }
}
