import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";
import { dbConnection } from "./db";

/**
 * Tiện ích xử lý API tập trung cho MES Buddy
 */

// Định nghĩa kiểu dữ liệu User mở rộng từ Session
export interface AuthenticatedUser {
  userId: string;
  userName: string;
  email: string;
  avatar?: string;
  role: string;
  is_banned: boolean;
}

/**
 * Hàm kiểm tra yêu cầu đăng nhập và trạng thái tài khoản
 * Trả về thông tin người dùng nếu hợp lệ, nếu không trả về một Response lỗi
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    return { 
      error: errorResponse("Bạn chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.", 401),
      user: null 
    };
  }

  const user = session.user as AuthenticatedUser;

  if (user.is_banned) {
    return {
      error: errorResponse("Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.", 403),
      user: null
    };
  }

  return { error: null, user };
}

/**
 * Hàm kiểm tra quyền quản trị viên (Admin)
 */
export async function requireAdmin() {
  const { error, user } = await requireAuth();
  
  if (error) return { error, user: null };
  
  if (user?.role !== "admin") {
    return {
      error: errorResponse("Bạn không có quyền truy cập tính năng này.", 403),
      user: null
    };
  }

  return { error: null, user };
}

/**
 * Hàm chuẩn hóa phản hồi lỗi JSON
 */
export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message, success: false }, { status });
}

/**
 * Hàm chuẩn hóa phản hồi thành công JSON
 */
export function successResponse(data: any = { success: true }) {
  return NextResponse.json(data);
}

/**
 * Tiện ích ghi log hành động của Admin một cách nhanh chóng
 */
export async function logAdminAction(adminId: string, source: string, message: string, details?: any) {
  try {
    await dbConnection.logs.create({
      user_id: adminId,
      level: 'info',
      source,
      message,
      details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : undefined
    });
  } catch (err) {
    console.error(`[LogAdminAction Fail] Source: ${source}, Msg: ${message}`, err);
  }
}
