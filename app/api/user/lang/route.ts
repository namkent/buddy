import { dbConnection } from "@/lib/db";
import { requireAuth } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { lang } = await req.json();
    if (!lang) return NextResponse.json({ error: "Lang is required" }, { status: 400 });

    await dbConnection.users.updateLang(user.userId, lang);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
