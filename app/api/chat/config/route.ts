import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const title = await dbConnection.settings.get("WELCOME_TITLE") || "Xin chào!";
    const subtitle = await dbConnection.settings.get("WELCOME_SUBTITLE") || "Tôi có thể giúp gì cho bạn không?";
    const suggestions = await dbConnection.suggestions.getActiveRandom(4);

    return NextResponse.json({
      welcome_title: title,
      welcome_subtitle: subtitle,
      suggestions: suggestions
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
  }
}
