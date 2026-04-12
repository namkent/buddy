import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const openai = createOpenAI({
  apiKey: process.env.GROQ_KEY,
  baseURL: process.env.GROQ_BASE_URL,
});

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ title: "New Chat" }), { 
        headers: { "Content-Type": "application/json" } 
      });
    }

    const { text } = await generateText({
      model: openai.chat(process.env.GROQ_MODEL || "llama-3.3-70b-versatile"),
      prompt: `Dựa vào đoạn tin nhắn mở đầu sau đây, hãy đặt một tiêu đề thật ngắn gọn (tối đa 4-5 từ) cho cuộc hội thoại. Chỉ trả về đúng đoạn text của tiêu đề, không cần bọc trong ngoặc kép hay giải thích gì thêm.\n\nTin nhắn: "${message}"`,
      providerOptions: {
        openai: {
          reasoningEffort: "none",
          reasoningSummary: "auto",
        },
      },
    });

    const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    return new Response(JSON.stringify({ title: cleanText }), { 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed to generate title" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
