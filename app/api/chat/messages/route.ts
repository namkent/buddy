import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, errorResponse, successResponse } from "@/lib/api-utils";

/**
 * [GET] Lấy toàn bộ danh sách tin nhắn của một cuộc hội thoại cụ thể
 */
export async function GET(req: Request) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const { userId, role } = user!;

  // Kiểm tra quyền truy cập cho tài khoản Guest
  if (role === "guest") {
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") return successResponse([]);
  }

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");
  if (!threadId) return successResponse([]);
  
  // Kiểm tra tính hợp lệ và quyền sở hữu hội thoại
  const thread = await dbConnection.threads.findById(threadId);
  if (!thread || (thread as any).user_id !== userId) return successResponse([]);

  try {
    const messages = await dbConnection.messages.findByThreadId(threadId);
    return NextResponse.json(messages);
  } catch (err) {
    console.error("Fetch messages fail:", err);
    return errorResponse("Không thể tải tin nhắn", 500);
  }
}

/**
 * [POST] Lưu một tin nhắn mới vào database (Thường gọi từ UI sau khi gửi/nhận xong)
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
    const message = await req.json();
    message.userId = userId;
    
    // Đảm bảo tin nhắn được lưu vào hội thoại thuộc về đúng người dùng
    const thread = await dbConnection.threads.findById(message.thread_id || message.threadId);
    if (!thread || (thread as any).user_id !== userId) {
      return errorResponse("Bạn không có quyền gửi tin nhắn vào hội thoại này", 403);
    }

    await dbConnection.messages.create(message);
    return successResponse({ success: true });
  } catch (err) {
    console.error("Save message fail:", err);
    return errorResponse("Lỗi hệ thống khi lưu tin nhắn", 500);
  }
}