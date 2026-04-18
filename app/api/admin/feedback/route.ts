import { NextResponse } from "next/server";
import { dbConnection } from "@/lib/db";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-utils";

/**
 * [GET] Lấy danh sách phản hồi (feedback) của người dùng
 */
export async function GET(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    
    const feedbacks = await dbConnection.messages.getFeedbacks(limit);
    
    return successResponse({ feedbacks });
  } catch (error) {
    console.error("Fetch feedbacks fail:", error);
    return errorResponse("Lỗi hệ thống khi tải danh sách phản hồi", 500);
  }
}
