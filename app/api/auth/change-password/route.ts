import { NextResponse } from "next/server";
import { dbConnection } from "@/lib/db";
import { requireAuth, errorResponse, successResponse } from "@/lib/api-utils";
import bcrypt from "bcryptjs";

/**
 * [POST] Đổi mật khẩu người dùng
 * Hỗ trợ cả người dùng thường và người dùng đăng nhập qua SSO (đặt mật khẩu lần đầu)
 */
export async function POST(req: Request) {
  try {
    const { user: sessionUser } = await requireAuth();
    const { email, oldPassword, newPassword } = await req.json();

    // Xác định email mục tiêu (ưu tiên từ body hoặc lấy từ session)
    const targetEmail = email || sessionUser?.email;

    if (!targetEmail) {
      return errorResponse("Vui lòng cung cấp email hoặc đăng nhập để tiếp tục", 401);
    }

    // Kiểm tra độ dài mật khẩu mới
    if (!newPassword || newPassword.length < 5) {
      return errorResponse("Mật khẩu mới phải có ít nhất 5 ký tự", 400);
    }

    // Tìm kiếm người dùng trong DB
    const dbUser = await dbConnection.users.findByEmail(targetEmail);
    if (!dbUser) {
      return errorResponse("Không tìm thấy tài khoản người dùng", 404);
    }

    // Trình tự kiểm tra mật khẩu cũ
    if (dbUser.password_hash) {
      if (!oldPassword) {
        return errorResponse("Vui lòng nhập mật khẩu hiện tại", 400);
      }
      const isMatch = await bcrypt.compare(oldPassword, dbUser.password_hash);
      if (!isMatch) {
         return errorResponse("Mật khẩu hiện tại không chính xác", 400);
      }
    } else {
      // Trường hợp tài khoản SSO chưa có mật khẩu: Yêu cầu phải đang login chính tài khoản đó
      if (!sessionUser || sessionUser.email !== targetEmail) {
        return errorResponse("Bạn phải đăng nhập qua SSO để thiết lập mật khẩu lần đầu", 403);
      }
    }

    // Mã hóa mật khẩu mới và cập nhật vào DB
    const newHash = await bcrypt.hash(newPassword, 10);
    await dbConnection.users.updatePassword(targetEmail, newHash);

    return successResponse({ success: true, message: "Đổi mật khẩu thành công!" });
  } catch (error) {
    console.error("Change password fail:", error);
    return errorResponse("Lỗi hệ thống khi đổi mật khẩu", 500);
  }
}
