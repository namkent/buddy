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
    const paramsResolved = await params;
    let pathSegments = paramsResolved.path;
    
    // Xử lý giải mã path nếu client gửi dưới dạng obfuscated (mã hóa Base64)
    if (pathSegments[0] === 'encoded' && pathSegments[1]) {
      try {
        let decodedStr = decodeURIComponent(Buffer.from(pathSegments[1], 'base64').toString('utf8'));
        
        // Chuẩn hóa dấu gạch chéo cho Windows/Linux
        decodedStr = decodedStr.replace(/\\/g, '/');
        
        // Lấy đường dẫn gốc (Root) của storage
        const storageRootRaw = process.env.EXTERNAL_STORAGE_PATH || path.join(process.cwd(), 'external_storage');
        const storageRoot = path.normalize(storageRootRaw).replace(/\\/g, '/');

        // Nếu đường dẫn đã là tuyệt đối và chứa storageRoot, hãy lấy phần tương đối
        if (decodedStr.includes(storageRoot)) {
          decodedStr = decodedStr.substring(decodedStr.indexOf(storageRoot) + storageRoot.length);
        } else if (path.isAbsolute(decodedStr)) {
          // Nếu là đường dẫn tuyệt đối khác, cố gắng trích xuất phần sau group_ hoặc file_
          const match = decodedStr.match(/\/(group_\d+\/file_\d+\/.*)/);
          if (match) decodedStr = match[1];
        }

        // Chia lại thành mảng pathSegments an toàn
        pathSegments = decodedStr.split('/').filter(Boolean);
      } catch (err) {
        return errorResponse("Đường dẫn không hợp lệ", 400);
      }
    }
    
    // 2. Lấy đường dẫn gốc (Root) của storage
    const storageRootRaw = process.env.EXTERNAL_STORAGE_PATH || path.join(process.cwd(), 'external_storage');
    const storageRoot = path.normalize(storageRootRaw);
    
    // 3. Xây dựng đường dẫn vật lý an toàn và chuẩn hóa
    const relativePath = path.join(...pathSegments);
    const safePhysicalPath = path.normalize(path.join(storageRoot, relativePath));

    // 4. Bảo mật: Chống tấn công Directory Traversal (Đảm bảo file nằm trong thư mục gốc cho phép)
    // Trên Windows, so sánh không phân biệt hoa thường và chuẩn hóa cả 2
    const normalizedSafePath = safePhysicalPath.toLowerCase().replace(/\\/g, '/');
    const normalizedStorageRoot = storageRoot.toLowerCase().replace(/\\/g, '/');

    if (!normalizedSafePath.startsWith(normalizedStorageRoot)) {
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

    const fileName = path.basename(safePhysicalPath);
    // Mã hóa tên file để tránh lỗi header khi có ký tự tiếng Việt/đặc biệt
    const encodedFileName = encodeURIComponent(fileName);

    return new Response(stream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodedFileName}`,
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error: any) {
    console.error("File distribution error:", error);
    return errorResponse("Lỗi hệ thống khi tải tệp tin", 500);
  }
}
