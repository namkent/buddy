import { createOpenAI } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { JSONSchema7, streamText } from "ai";
import { dbConnection } from "@/lib/db";

const openai = createOpenAI({
  apiKey: process.env.GROQ_KEY,
  baseURL: process.env.GROQ_BASE_URL,
});

export async function POST(req: Request) {
  const { message, threadId, system, tools }: {
    message: any;
    threadId?: string;
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  } = await req.json();

  if (!message) {
    return new Response("Missing message", { status: 400 });
  }

  const session = await getServerSession(authOptions);

  // Helper: trả về message lỗi dưới dạng stream để chat UI hiển thị được
  const errorStream = (msg: string) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(msg));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  };

  if (!session) {
    return errorStream("⚠️ Bạn chưa đăng nhập. Vui lòng đăng nhập để sử dụng trợ lý AI.");
  }

  const { userId, userName, email, avatar, is_banned, role } = session.user as any;

  if (is_banned) {
    return errorStream("🚫 Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên do vi phạm điều khoản hệ thống.\n\nVui lòng hệ admin@mes.local để biết thêm chi tiết.");
  }

  if (role === "guest") {
    return errorStream("🔒 Tài khoản của bạn đang ở cấp độ **Guest** và chưa được cấp quyền sử dụng hệ thống.\n\nVui lòng liên hệ Quản trị viên để được phê duyệt quyền truy cập.");
  }

  // Fire-and-forget: cập nhật last_active không làm chậm request
  if (userId) {
    dbConnection.users.updateLastActive(userId).catch(() => {});
  }

  let apiMessages: any[] = [];

  // Reconstruct history from database
  if (threadId) {
    const dbMessages = await dbConnection.messages.findByThreadId(threadId);
    apiMessages = dbMessages.map((m: any) => {
      let parsedContent = m.content;
      try {
        if (typeof m.content === "string") parsedContent = JSON.parse(m.content);
      } catch (e) {
        parsedContent = m.content;
      }
      
      return {
        role: m.role,
        content: Array.isArray(parsedContent)
          ? parsedContent.map((c: any) => {
              if (c.type === "text") return { type: "text", text: c.text };
              if (process.env.ENABLE_VISION === "true" && c.type === "image") return { type: "image", image: c.image };
              return null;
            }).filter(Boolean)
          : String(m.content).replace(/<think>[\s\S]*?<\/think>/g, "")
      };
    });

    // Check if the current message is already in DB history 
    // to avoid sending it twice to the AI prompt
    const lastDbMsg = dbMessages[dbMessages.length - 1];
    if (lastDbMsg?.id !== message.id) {
      apiMessages.push({
        role: message.role,
        content: Array.isArray(message.content)
          ? message.content.map((c: any) => {
              if (c.type === "text") return { type: "text", text: c.text };
              if (process.env.ENABLE_VISION === "true" && c.type === "image") return { type: "image", image: c.image };
              return null;
            }).filter(Boolean)
          : message.content
      });
    }
  } else {
    // Failsafe mostly
    apiMessages.push({
      role: message.role,
      content: Array.isArray(message.content)
        ? message.content.map((c: any) => {
            if (c.type === "text") return { type: "text", text: c.text };
            if (process.env.ENABLE_VISION === "true" && c.type === "image") return { type: "image", image: c.image };
            return null;
          }).filter(Boolean)
        : message.content
    });
  }

  // Lấy content sạch từ tin nhắn cuối cùng của user để nạp Memory
  const cleanMessageContent = Array.isArray(message.content)
    ? message.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
    : message.content;

  // --- MEM0 MEMORY INTEGRATION ---
  let memoryContextStr = "";
  if (process.env.ENABLE_MEM0 === "true") {
    try {
      const { memory } = await import("@/lib/memory");
      const ctx = await memory.search(cleanMessageContent, { userId });
      console.log(`memory [${userId}] : ${ctx}`);
      if (ctx) memoryContextStr = ctx;

      memory.add(cleanMessageContent, { userId }).then(() => {
        console.log(`memory add [${userId}] : OK`);
      }).catch((e: any) => {
        console.error(`memory add [${userId}] FAIL:`, e?.message || e);
      });
    } catch (error) {
      console.error("Mem0 Search Fail:", error);
    }
  }

  // Scan whether any message has an image block to swap the model if needed
  const hasImage = apiMessages.some(m => 
    Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image')
  );
  
  const selectedModel = hasImage 
    ? "llama-3.2-90b-vision-preview" 
    : (process.env.GROQ_MODEL || "llama-3.3-70b-versatile");

  // Lấy cấu hình hệ thống
  const [dbSystemPrompt, rawEnableTranslate, rawEnableRag] = await Promise.all([
    dbConnection.settings.get("SYSTEM_PROMPT"),
    dbConnection.settings.get("ENABLE_TOOL_TRANSLATE"),
    dbConnection.settings.get("ENABLE_TOOL_RAG_SEARCH")
  ]);

  const resolvedSystemPrompt = dbSystemPrompt || "Bạn là trợ lý ảo MES Buddy, giúp giải quyết các công việc trong hệ thống. Bạn mang phong cách như một đồng nghiệp thông minh, thân thiện.";

  const activeTools = { ...frontendTools(tools ?? {}) };
  
  if (rawEnableTranslate === "false" || rawEnableTranslate === "0") {
    // Nếu có tool dịch và đang bị tắt, xoá nó để LLM không gọi được
    if (activeTools.translate) delete activeTools.translate;
  }
  if (rawEnableRag === "false" || rawEnableRag === "0") {
    if (activeTools.rag_search) delete activeTools.rag_search;
    if (activeTools.ragSearch) delete activeTools.ragSearch;
  }

  const result = streamText({
    model: openai.chat(selectedModel),
    messages: apiMessages,
    system:
      `Role: You are the SDV MES Portal AI Assistant. You are chatting with: ${userName} (Email: ${email}). ${resolvedSystemPrompt}\n\n[USER MEMORY CONTEXT]\nHere are the extracted user memories retrieved for this conversation:\n${memoryContextStr}\n[END MEMORY CONTEXT]`,
    tools: activeTools,
    providerOptions: {
      openai: {
        reasoningEffort: "none",
        reasoningSummary: "auto",
      },
    },
  });

  return result.toTextStreamResponse();
}
