import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // 1. Kiểm tra session nếu cần bảo mật
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { path: pathSegments } = await params;
    
    // 2. Lấy root storage path từ .env
    const storageRoot = process.env.EXTERNAL_STORAGE_PATH || path.join(process.cwd(), 'external_storage');
    
    // 3. Xây dựng đường dẫn vật lý an toàn
    const relativePath = path.join(...pathSegments);
    const safePhysicalPath = path.normalize(path.join(storageRoot, relativePath));

    // 4. Bảo mật: Đảm bảo đường dẫn nằm trong storageRoot (tránh directory traversal)
    if (!safePhysicalPath.startsWith(path.normalize(storageRoot))) {
      return new Response("Forbidden", { status: 403 });
    }

    // 5. Kiểm tra file tồn tại
    if (!fs.existsSync(safePhysicalPath) || fs.lstatSync(safePhysicalPath).isDirectory()) {
      return new Response("File not found", { status: 404 });
    }

    // 6. Xác định Content-Type
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

    // 7. Đọc và Stream file
    const fileStream = fs.createReadStream(safePhysicalPath);
    
    // Chuyển đổi Node.js stream sang Web stream cho NextResponse
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
        'Cache-Control': 'public, max-age=3600', // Cache 1 giờ
      },
    });

  } catch (error: any) {
    console.error("File server error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
