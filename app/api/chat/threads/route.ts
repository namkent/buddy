import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, errorResponse, successResponse } from "@/lib/api-utils";

/**
 * [GET] Lấy danh sách hội thoại của người dùng hoặc chi tiết một hội thoại
 */
export async function GET(req: Request) {
  // 1. Xác thực người dùng
  const { error, user } = await requireAuth();
  if (error) return error;
  
  const { userId, role } = user!;

  // 2. Kiểm tra quyền Guest (nếu hệ thống không cho phép Guest nhắn tin)
  if (role === "guest") {
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") return successResponse([]); // Trả về mảng trống thay vì lỗi để tránh crash UI
  }
  
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  // Trường hợp lấy chi tiết 1 thread
  if (id) {
    const thread = await dbConnection.threads.findById(id);
    if (!thread || (thread as any).user_id !== userId) {
      return errorResponse("Không tìm thấy hội thoại hoặc bạn không có quyền truy cập", 403);
    }
    return NextResponse.json(thread);
  }

  // Trường hợp lấy toàn bộ danh sách
  const threads = await dbConnection.threads.findAll(userId);
  return NextResponse.json(threads);
}

/**
 * [POST] Khởi tạo một cuộc hội thoại mới
 */
export async function POST(req: Request) {
  const { error, user } = await requireAuth();
  if (error) return error;
  
  const { userId, role } = user!;

  if (role === "guest") {
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") return errorResponse("Quyền hạn Guest bị hạn chế", 403);
  }
  
  try {
    const { id } = await req.json();
    if (!id) return errorResponse("Thiếu ID hội thoại", 400);

    const thread = await dbConnection.threads.create({ id, userId });
    return successResponse(thread);
  } catch (err) {
    return errorResponse("Không thể tạo hội thoại mới", 500);
  }
}

/**
 * [PUT] Cập nhật thông tin hội thoại (Tiêu đề, trạng thái Lưu trữ)
 */
export async function PUT(req: Request) {
  const { error, user } = await requireAuth();
  if (error) return error;
  
  const { userId } = user!;

  try {
    const { id, data } = await req.json();
    const thread = await dbConnection.threads.findById(id);
    
    // Kiểm tra quyền sở hữu thread trước khi cập nhật
    if (!thread || (thread as any).user_id !== userId) {
      return errorResponse("Bạn không có quyền chỉnh sửa hội thoại này", 403);
    }
    
    await dbConnection.threads.update(id, data);
    return successResponse({ success: true });
  } catch (err) {
    return errorResponse("Lỗi hệ thống khi cập nhật hội thoại", 500);
  }
}

/**
 * [DELETE] Xóa một cuộc hội thoại (Và toàn bộ tin nhắn liên quan)
 */
export async function DELETE(req: Request) {
  const { error, user } = await requireAuth();
  if (error) return error;
  
  const { userId } = user!;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    
    if (id) {
      const thread = await dbConnection.threads.findById(id);
      
      // Chỉ chủ sở hữu mới được xóa thread
      if (thread && (thread as any).user_id === userId) {
        await dbConnection.threads.delete(id);
      } else {
        return errorResponse("Bạn không có quyền xóa hội thoại này", 403);
      }
    }
    return successResponse({ success: true });
  } catch (err) {
    return errorResponse("Lỗi khi xóa hội thoại", 500);
  }
}