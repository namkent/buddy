import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET(req: Request) {
  await dbConnection.initTables();
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  
  const role = (session.user as any).role;
  if (role === "guest") {
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") return NextResponse.json([]);
  }
  
  const userId = (session.user as any).userId;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const thread = await dbConnection.threads.findById(id);
    if (!thread || (thread as any).user_id !== userId) return new NextResponse("Forbidden", { status: 403 });
    return NextResponse.json(thread);
  }

  const threads = await dbConnection.threads.findAll(userId);
  return NextResponse.json(threads);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  
  const role = (session.user as any).role;
  if (role === "guest") {
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") return new NextResponse("Forbidden", { status: 403 });
  }
  
  const userId = (session.user as any).userId;

  const { id } = await req.json();
  const thread = await dbConnection.threads.create({ id, userId });
  return NextResponse.json(thread);
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  
  const role = (session.user as any).role;
  if (role === "guest") {
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") return new NextResponse("Forbidden", { status: 403 });
  }
  
  const userId = (session.user as any).userId;

  const { id, data } = await req.json();
  const thread = await dbConnection.threads.findById(id);
  if (!thread || (thread as any).user_id !== userId) return new NextResponse("Forbidden", { status: 403 });
  
  await dbConnection.threads.update(id, data);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  
  const role = (session.user as any).role;
  if (role === "guest") {
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") return new NextResponse("Forbidden", { status: 403 });
  }
  
  const userId = (session.user as any).userId;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (id) {
    const thread = await dbConnection.threads.findById(id);
    if (thread && (thread as any).user_id === userId) {
      await dbConnection.threads.delete(id);
    } else {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }
  return NextResponse.json({ success: true });
}