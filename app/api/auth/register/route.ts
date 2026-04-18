import { NextResponse } from "next/server";
import { dbConnection } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api-utils";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * [POST] Đăng ký tài khoản người dùng mới
 */
export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    // Kiểm tra tính đầy đủ của thông tin
    if (!name || !email || !password) {
      return errorResponse("Vui lòng điền đầy đủ thông tin", 400);
    }

    // Kiểm tra email đã tồn tại hay chưa
    const existingUser = await dbConnection.users.findByEmail(email);
    if (existingUser) {
      return errorResponse("Email này đã được sử dụng", 409);
    }

    // Mã hóa mật khẩu (hashing)
    const password_hash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    // Tạo bản ghi người dùng mới (Mặc định role là Guest)
    await dbConnection.users.create({
      id: userId,
      name,
      email,
      password_hash
    });

    return successResponse({ success: true, message: "Đăng ký thành công!" });
  } catch (error) {
    console.error("Đăng ký thất bại:", error);
    return errorResponse("Lỗi hệ thống khi đăng ký", 500);
  }
}
