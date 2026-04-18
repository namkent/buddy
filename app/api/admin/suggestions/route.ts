import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAdmin, errorResponse, successResponse, logAdminAction } from "@/lib/api-utils";

/**
 * [GET] Lấy toàn bộ danh sách gợi ý hội thoại (Prompt Suggestions)
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const suggestions = await dbConnection.suggestions.getAll();
    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("Fetch suggestions fail:", error);
    return errorResponse("Không thể tải danh sách gợi ý", 500);
  }
}

/**
 * [POST] Tạo một gợi ý hội thoại mới
 */
export async function POST(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  try {
    const data = await req.json();
    if (!data.title || !data.prompt) {
      return errorResponse("Tiêu đề và câu lệnh (prompt) là bắt buộc", 400);
    }
    
    const suggestion = await dbConnection.suggestions.create({
      title: data.title,
      prompt: data.prompt,
      is_auto_generated: false
    });

    // Ghi Log hành động
    await logAdminAction(admin!.userId, 'system', `Đã tạo gợi ý hội thoại mới: ${data.title}`);

    return successResponse({ success: true, suggestion });
  } catch (error) {
    console.error("Create suggestion fail:", error);
    return errorResponse("Lỗi hệ thống khi tạo gợi ý", 500);
  }
}

/**
 * [PUT] Cập nhật thông tin hoặc trạng thái (Active/Inactive) của gợi ý
 */
export async function PUT(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");
    if (!idParam) return errorResponse("Thiếu ID gợi ý", 400);
    
    const id = parseInt(idParam, 10);
    const data = await req.json();
    
    await dbConnection.suggestions.update(id, data);
    
    // Ghi Log
    await logAdminAction(admin!.userId, 'system', `Đã cập nhật gợi ý hội thoại ID: ${id}`);
    
    return successResponse({ success: true });
  } catch (error) {
    console.error("Update suggestion fail:", error);
    return errorResponse("Lỗi hệ thống khi cập nhật gợi ý", 500);
  }
}

/**
 * [DELETE] Xóa vĩnh viễn một gợi ý hội thoại
 */
export async function DELETE(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");
    if (!idParam) return errorResponse("Thiếu ID gợi ý cần xóa", 400);
    
    const id = parseInt(idParam, 10);
    await dbConnection.suggestions.delete(id);

    // Ghi Log
    await logAdminAction(admin!.userId, 'system', `Đã xóa gợi ý hội thoại ID: ${id}`);

    return successResponse({ success: true });
  } catch (error) {
    console.error("Delete suggestion fail:", error);
    return errorResponse("Lỗi hệ thống khi xóa gợi ý", 500);
  }
}
