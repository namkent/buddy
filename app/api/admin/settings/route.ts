import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAdmin, errorResponse, successResponse, logAdminAction } from "@/lib/api-utils";

/**
 * [GET] Lấy toàn bộ cấu hình hệ thống
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    await dbConnection.initTables();
    const settings = await dbConnection.settings.getAll();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Fetch settings fail:", error);
    return errorResponse("Không thể tải cấu hình hệ thống", 500);
  }
}

/**
 * [PUT] Cập nhật danh sách các cấu hình hệ thống
 */
export async function PUT(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  try {
    const body = await req.json();
    
    // Yêu cầu format body: { settings: [{ key: 'KEY', value: 'VAL', description: 'DESC' }] }
    if (Array.isArray(body.settings)) {
      for (const item of body.settings) {
        if (item.key) {
          await dbConnection.settings.set(item.key, item.value || "", item.description);
        }
      }

      // GhiLog hành động thay đổi cấu hình
      await logAdminAction(admin!.userId, 'system', 'Đã cập nhật cấu hình hệ thống', body.settings);

      return successResponse({ success: true, message: "Cập nhật cấu hình thành công" });
    }
    
    return errorResponse("Định dạng dữ liệu không hợp lệ", 400);
  } catch (error) {
    console.error("Update settings fail:", error);
    return errorResponse("Lỗi hệ thống khi cập nhật cấu hình", 500);
  }
}
