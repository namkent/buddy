import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { dbConnection } from "@/lib/db";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const role = (session.user as any).role;
  if (role === "guest") {
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") return new Response("Forbidden", { status: 403 });
  }

  try {
    const { message, isPeriodic } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ title: "New Chat" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const promptText = isPeriodic
      ? `Dựa vào lịch sử đoạn chat gần đây sau đây, hãy đặt một tiêu đề thật ngắn gọn (tối đa 4-5 từ) tóm tắt nội dung chính của cuộc hội thoại. Chỉ trả về đúng đoạn text của tiêu đề, không cần bọc trong ngoặc kép hay giải thích gì thêm.\n\nLịch sử chat:\n"${message}"`
      : `Dựa vào đoạn tin nhắn mở đầu sau đây, hãy đặt một tiêu đề thật ngắn gọn (tối đa 4-5 từ) cho cuộc hội thoại. Chỉ trả về đúng đoạn text của tiêu đề, không cần bọc trong ngoặc kép hay giải thích gì thêm.\n\nTin nhắn: "${message}"`;

    const { text } = await generateText({
      model: openai.chat(process.env.OPENAI_MODEL || "llama-3.3-70b-versatile"),
      prompt: promptText,
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
