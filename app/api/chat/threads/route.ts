import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  await dbConnection.initTables();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const thread = await dbConnection.threads.findById(id);
    return NextResponse.json(thread);
  }

  const threads = await dbConnection.threads.findAll();
  return NextResponse.json(threads);
}

export async function POST(req: Request) {
  const { id } = await req.json();
  const thread = await dbConnection.threads.create({ id });
  return NextResponse.json(thread);
}

export async function PUT(req: Request) {
  const { id, data } = await req.json();
  await dbConnection.threads.update(id, data);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (id) await dbConnection.threads.delete(id);
  return NextResponse.json({ success: true });
}