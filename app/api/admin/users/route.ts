import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { dbConnection } from "@/lib/db";

async function isAdmin() {
  const session = await getServerSession(authOptions);
  return session && (session.user as any).role === "admin";
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const users = await dbConnection.users.findAll();
  return NextResponse.json(users);
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  
  try {
    const { id, role_id, is_banned } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    
    // Convert role_id if passed as string
    const dbRole = role_id ? parseInt(role_id) : undefined;
    
    await dbConnection.users.update(id, { role_id: dbRole, is_banned });

    // Log action
    const adminSession = await getServerSession(authOptions);
    await dbConnection.logs.create({
      user_id: (adminSession?.user as any).userId,
      level: 'info',
      source: 'users',
      message: `Updated user information for ID: ${id}`,
      details: JSON.stringify({ role_id: dbRole, is_banned })
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    await dbConnection.users.delete(id);

    // Ghi Log
    const adminSession = await getServerSession(authOptions);
    await dbConnection.logs.create({
      user_id: (adminSession?.user as any).userId,
      level: 'warn',
      source: 'users',
      message: `Đã xóa người dùng vĩnh viễn ID: ${id}`
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
