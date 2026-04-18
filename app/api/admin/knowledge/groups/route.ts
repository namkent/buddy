import { NextResponse } from 'next/server';
import { dbConnection } from '@/lib/db';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const groups = await dbConnection.knowledge.getGroupsWithCount();
    return NextResponse.json({ groups });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { name, description } = await req.json();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    
    const group = await dbConnection.knowledge.createGroup(name, description || "");
    
    // Log action
    await dbConnection.logs.create({
      user_id: (session.user as any).userId,
      level: 'info',
      source: 'knowledge_base',
      message: `Created knowledge category: ${name}`,
      details: JSON.stringify(group)
    });

    return NextResponse.json({ group });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
