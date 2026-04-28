import { dbConnection } from "@/lib/db";
import { requireAuth } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error || user?.role !== 'admin') return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await dbConnection.translations.getAll();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error || user?.role !== 'admin') return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const result = await dbConnection.translations.upsert(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("UPSERT Translation Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error || user?.role !== 'admin') return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });
    await dbConnection.translations.delete(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
