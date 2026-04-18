import { NextResponse } from 'next/server';
import { dbConnection } from '@/lib/db';
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-utils";

/**
 * [GET] Lấy danh sách logs hệ thống với phân trang và bộ lọc
 */
export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const level = searchParams.get('level');
    const source = searchParams.get('source');
    const user_id = searchParams.get('user_id');

    // Tìm kiếm logs dựa trên bộ lọc
    const logs = await dbConnection.logs.findAll(limit, offset, { level, source, user_id });
    return successResponse({ logs });
  } catch (error: any) {
    console.error("Fetch logs fail:", error);
    return errorResponse("Lỗi hệ thống khi tải nhật ký", 500);
  }
}

/**
 * [POST] Tạo một bản ghi log thủ công (dành cho Admin)
 */
export async function POST(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  try {
    const data = await req.json();
    const log = await dbConnection.logs.create({
      ...data,
      user_id: admin!.userId
    });
    return successResponse({ log });
  } catch (error: any) {
    console.error("Create log fail:", error);
    return errorResponse("Không thể tạo bản ghi nhật ký", 500);
  }
}
