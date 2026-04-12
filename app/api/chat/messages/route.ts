import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const role = (session.user as any).role;
  if (role === "guest") return NextResponse.json([]);

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");
  if (!threadId) return NextResponse.json([]);
  
  const thread = await dbConnection.threads.findById(threadId);
  if (!thread || (thread as any).user_id !== (session.user as any).userId) return NextResponse.json([]);

  const messages = await dbConnection.messages.findByThreadId(threadId);
  return NextResponse.json(messages);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const role = (session.user as any).role;
  if (role === "guest") return new NextResponse("Forbidden", { status: 403 });

  try {
    const message = await req.json();
    message.userId = (session.user as any).userId;
    
    const thread = await dbConnection.threads.findById(message.thread_id || message.threadId);
    if (!thread || (thread as any).user_id !== message.userId) return new NextResponse("Forbidden", { status: 403 });

    await dbConnection.messages.create(message);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}