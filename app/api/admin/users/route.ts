import { NextResponse } from "next/server";
import { dbConnection } from "@/lib/db";
import { requireAdmin, errorResponse, successResponse, logAdminAction } from "@/lib/api-utils";

/**
 * [GET] Lấy danh sách tất cả người dùng hệ thống
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const users = await dbConnection.users.findAll();
    return NextResponse.json(users);
  } catch (err) {
    console.error("Fetch users fail:", err);
    return errorResponse("Không thể tải danh sách người dùng", 500);
  }
}

/**
 * [PUT] Cập nhật thông tin người dùng (Quyền hạn, Trạng thái khóa)
 */
export async function PUT(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;
  
  try {
    const { id, role_id, is_banned } = await req.json();
    if (!id) return errorResponse("Thiếu mã định danh người dùng (ID)", 400);
    
    // Chuyển đổi role_id sang số nếu được gửi dưới dạng chuỗi
    const dbRole = role_id ? parseInt(role_id) : undefined;
    
    // Thực hiện cập nhật trong DB
    await dbConnection.users.update(id, { role_id: dbRole, is_banned });

    // Ghi lại hành động của Admin vào hệ thống Log
    await logAdminAction(admin!.userId, 'users', `Cập nhật thông tin user ID: ${id}`, { role_id: dbRole, is_banned });

    return successResponse({ success: true, message: "Cập nhật người dùng thành công" });
  } catch (err) {
    console.error("Update user fail:", err);
    return errorResponse("Lỗi hệ thống khi cập nhật người dùng", 500);
  }
}

/**
 * [DELETE] Xóa vĩnh viễn người dùng khỏi hệ thống
 */
export async function DELETE(req: Request) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;
  
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return errorResponse("Thiếu ID người dùng cần xóa", 400);

    // Xóa từ DB
    await dbConnection.users.delete(id);

    // Ghi Log hành động xóa
    await logAdminAction(admin!.userId, 'users', `Đã xóa người dùng vĩnh viễn ID: ${id}`);

    return successResponse({ success: true, message: "Đã xóa người dùng thành công" });
  } catch (err) {
    console.error("Delete user fail:", err);
    return errorResponse("Lỗi khi xóa người dùng", 500);
  }
}
