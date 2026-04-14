import { dbConnection } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const title = await dbConnection.settings.get("WELCOME_TITLE") || "Xin chào!";
    const subtitle = await dbConnection.settings.get("WELCOME_SUBTITLE") || "Tôi có thể giúp gì cho bạn không?";
    const suggestions = await dbConnection.suggestions.getActiveRandom(4);

    const summarize = await dbConnection.settings.get("ENABLE_TOOL_SUMMARIZE") !== "false";
    const translate = await dbConnection.settings.get("ENABLE_TOOL_TRANSLATE") !== "false";
    const search = await dbConnection.settings.get("ENABLE_TOOL_RAG_SEARCH") !== "false";

    return NextResponse.json({
      welcome_title: title,
      welcome_subtitle: subtitle,
      suggestions: suggestions,
      features: {
        summarize,
        translate,
        search
      }
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
  }
}
