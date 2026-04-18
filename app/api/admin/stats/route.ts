import { NextResponse } from "next/server";
import { dbConnection } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/api-utils";

/**
 * [GET] Lấy số liệu thống kê hệ thống (Người dùng, Hội thoại, Tin nhắn, Chart)
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const stats = await dbConnection.users.getStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Fetch stats fail:", error);
    return errorResponse("Lỗi hệ thống khi tải thống kê", 500);
  }
}
