import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { requireAuth } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const TARGET_LANGS = ['en', 'vi', 'kr', 'ja', 'zh', 'fr', 'de', 'es'];

export async function POST(req: NextRequest) {
  const { error, user } = await requireAuth();
  if (error || user?.role !== 'admin') return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { en, vi, type, key, text: rawText, sourceLang: rawSourceLang } = body;
    
    // Priority: en > vi > text
    const sourceText = en || vi || rawText;
    let sourceLang = 'English';
    if (!en && vi) sourceLang = 'Vietnamese';
    if (!en && !vi && rawSourceLang) sourceLang = rawSourceLang === 'vi' ? 'Vietnamese' : 'English';

    if (!sourceText) {
      return NextResponse.json({ error: "Source text (en or vi) is required" }, { status: 400 });
    }

    const model = process.env.OPENAI_MODEL || "llama-3.3-70b-versatile";
    
    const { text } = await generateText({
      model: openai.chat(model),
      system: `You are a professional translator for a MES (Manufacturing Execution System) application.
      You MUST translate the given text into ALL of these 8 languages: ${TARGET_LANGS.join(', ')}.
      
      Rules:
      1. Context: Industrial software, MES, manufacturing, labels, messages.
      2. Format: Return ONLY a JSON object where keys are language codes and values are translated strings.
      3. COMPLETENESS: Do not skip ANY language. Every key in [${TARGET_LANGS.join(', ')}] must have a non-empty translated value.
      4. Consistency: Ensure professional and consistent terminology.
      5. Do not include any explanations or markdown formatting outside the JSON object.`,
      prompt: `Translate this ${type || 'text'} with key "${key || 'unknown'}": "${sourceText}"`,
    });

    try {
      // Clean potential markdown if LLM includes it
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const translations = JSON.parse(cleanJson);
      return NextResponse.json(translations);
    } catch (parseError) {
      console.error("LLM Parse Error:", text);
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }
  } catch (error) {
    console.error("Translate API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
