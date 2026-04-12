import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");
  if (!threadId) return NextResponse.json([]);
  const messages = await dbConnection.messages.findByThreadId(threadId);
  return NextResponse.json(messages);
}

export async function POST(req: Request) {
  try {
    const message = await req.json();
    await dbConnection.messages.create(message);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}