import { NextRequest, NextResponse } from "next/server";
import { dbConnection } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";
import { v4 as uuidv4 } from "uuid";

export const dynamic = 'force-dynamic';

// GET: Lấy danh sách Agents
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const onlyActive = searchParams.get('active') === 'true';
    
    const agents = await dbConnection.agents.findAll(onlyActive);
    return NextResponse.json(agents);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Tạo mới Agent (Admin only)
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireAdmin();
    if (error) return error;

    const data = await req.json();
    if (!data.name || !data.system_prompt) {
      return NextResponse.json({ error: "Missing name or system_prompt" }, { status: 400 });
    }

    const newAgent = await dbConnection.agents.create({
      id: uuidv4(),
      name: data.name,
      description: data.description || "",
      system_prompt: data.system_prompt,
      icon: data.icon || "Bot",
      is_active: data.is_active ?? true
    });

    return NextResponse.json(newAgent);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Cập nhật Agent (Admin only)
export async function PUT(req: NextRequest) {
  try {
    const { error, user } = await requireAdmin();
    if (error) return error;

    const data = await req.json();
    const { id, ...updates } = data;
    
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await dbConnection.agents.update(id, updates);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Xóa Agent (Admin only)
export async function DELETE(req: NextRequest) {
  try {
    const { error, user } = await requireAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await dbConnection.agents.delete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
