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
    await dbConnection.initTables();
    const settings = await dbConnection.settings.getAll();
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    if (Array.isArray(body.settings)) {
      // Body example: { settings: [{ key: 'WELCOME_TITLE', value: 'Hello' }] }
      for (const item of body.settings) {
        if (item.key) {
          await dbConnection.settings.set(item.key, item.value || "", item.description);
        }
      }
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Invalid payload format" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
