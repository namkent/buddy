import { NextResponse } from "next/server";
import { dbConnection } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Vui lòng điền đầy đủ thông tin" }, { status: 400 });
    }

    const existingUser = await dbConnection.users.findByEmail(email);
    if (existingUser) {
      return NextResponse.json({ error: "Email này đã được sử dụng" }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    await dbConnection.users.create({
      id: userId,
      name,
      email,
      password_hash
    });

    return NextResponse.json({ success: true, message: "Đăng ký thành công!" });
  } catch (error) {
    console.error("Đăng ký thất bại:", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi đăng ký" }, { status: 500 });
  }
}
