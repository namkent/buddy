import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const suggestions = await dbConnection.suggestions.getAll();
    return NextResponse.json(suggestions);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const data = await req.json();
    if (!data.title || !data.prompt) {
      return NextResponse.json({ error: "Title and prompt are required" }, { status: 400 });
    }
    
    const suggestion = await dbConnection.suggestions.create({
      title: data.title,
      prompt: data.prompt,
      is_auto_generated: false
    });
    return NextResponse.json({ success: true, suggestion });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create suggestion" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");
    if (!idParam) return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    
    const id = parseInt(idParam, 10);
    const data = await req.json();
    
    await dbConnection.suggestions.update(id, data);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update suggestion" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");
    if (!idParam) return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    
    const id = parseInt(idParam, 10);
    await dbConnection.suggestions.delete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
