import { pool } from "@/lib/db";
import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const openai = createOpenAI({
  apiKey: process.env.GROQ_KEY,
  baseURL: process.env.GROQ_BASE_URL,
});

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  try {
    const recentMessages = await pool.query(
      `SELECT content FROM chat_messages 
       WHERE role = 'user' 
         AND created_at >= NOW() - INTERVAL '24 hours' 
       ORDER BY created_at DESC 
       LIMIT 100`
    );

    if (recentMessages.rows.length === 0) {
      return NextResponse.json({ message: "Not enough recent messages to generate suggestions" });
    }

    const messagesText = recentMessages.rows.map((m: any) => m.content).join("\n---\n");

    const promptText = `Phân tích các đoạn tin nhắn sau do người dùng đã gửi trong 24 giờ qua:

${messagesText}

Hãy đề xuất đúng 4 câu hỏi hoặc chủ đề hot/phổ biến nhất (thực tế và hữu ích) mà người dùng mới có thể tham khảo.
Lưu ý quan trọng về ngôn ngữ:
- Câu hỏi và diễn giải viết bằng tiếng Việt.
- Với các thuật ngữ chuyên ngành IT, hệ thống, kỹ thuật (ví dụ: API, RAG, LLM, dashboard, database, deployment, server, MES, ERP, log, debug, endpoint, token...) thì GIỮ NGUYÊN tiếng Anh, KHÔNG dịch sang tiếng Việt.
Chỉ trả về JSON thuần túy, không giải thích, không markdown, theo đúng format sau:
{"suggestions":[{"title":"Tên ngắn 5-7 chữ","prompt":"Câu hỏi đầy đủ người dùng sẽ gửi"},{"title":"...","prompt":"..."},{"title":"...","prompt":"..."},{"title":"...","prompt":"..."}]}`;

    const { text } = await generateText({
      model: openai.chat(process.env.GROQ_MODEL || "llama-3.3-70b-versatile"),
      prompt: promptText,
    });

    // Parse JSON từ response text
    let parsed: { suggestions: { title: string; prompt: string }[] };
    try {
      // Trích xuất JSON block nếu model wrap thêm text xung quanh
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("JSON parse error, raw text:", text);
      return NextResponse.json({ error: "LLM returned invalid JSON", raw: text }, { status: 500 });
    }

    const suggestions = parsed.suggestions;
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return NextResponse.json({ error: "No suggestions parsed from response" }, { status: 500 });
    }

    // Ẩn các gợi ý cũ do LLM tạo, rồi chèn gợi ý mới
    await pool.query('UPDATE thread_suggestions SET active = FALSE WHERE is_auto_generated = TRUE');

    for (const sug of suggestions) {
      if (sug.title && sug.prompt) {
        await pool.query(
          'INSERT INTO thread_suggestions (title, prompt, is_auto_generated, active) VALUES ($1, $2, TRUE, TRUE)',
          [sug.title, sug.prompt]
        );
      }
    }

    return NextResponse.json({ success: true, processed: suggestions });

  } catch (error: any) {
    console.error("Cron Generate Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
