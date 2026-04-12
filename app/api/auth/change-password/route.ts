import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { dbConnection } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { email, oldPassword, newPassword } = await req.json();

    const targetEmail = email || session?.user?.email;

    if (!targetEmail) {
      return NextResponse.json({ error: "Vui lòng cung cấp email hoặc đăng nhập để đổi mật khẩu" }, { status: 401 });
    }

    if (!newPassword || newPassword.length < 5) {
      return NextResponse.json({ error: "Mật khẩu mới phải có ít nhất 5 ký tự" }, { status: 400 });
    }

    const dbUser = await dbConnection.users.findByEmail(targetEmail);
    if (!dbUser) {
      return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });
    }

    // Nếu người dùng đã có mật khẩu trước đó, bắt buộc nhập đúng mật khẩu cũ
    if (dbUser.password_hash) {
      if (!oldPassword) {
        return NextResponse.json({ error: "Vui lòng nhập mật khẩu cũ" }, { status: 400 });
      }
      const isMatch = await bcrypt.compare(oldPassword, dbUser.password_hash);
      if (!isMatch) {
         return NextResponse.json({ error: "Mật khẩu cũ không chính xác" }, { status: 400 });
      }
    } else {
      // Nếu chưa có password (SSO), bắt buộc phải có session đang login bằng email đó thì mới cho set pass
      if (!session || session.user?.email !== targetEmail) {
        return NextResponse.json({ error: "Bạn phải đăng nhập qua SSO để tự đặt mật khẩu mới" }, { status: 403 });
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await dbConnection.users.updatePassword(targetEmail, newHash);

    return NextResponse.json({ success: true, message: "Cập nhật mật khẩu thành công!" });
  } catch (error) {
    console.error("Đổi pass thất bại:", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi đổi mật khẩu" }, { status: 500 });
  }
}
