import { dbConnection } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") || "en";

  try {
    const translations = await dbConnection.translations.getByLang(lang);
    return NextResponse.json(translations);
  } catch (error) {
    console.error("Fetch translations error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
