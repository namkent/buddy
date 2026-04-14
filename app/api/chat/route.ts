import { createOpenAI } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { JSONSchema7, streamText } from "ai";
import { dbConnection } from "@/lib/db";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
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
    dbConnection.users.updateLastActive(userId).catch(() => { });
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
  let cleanMessageContent: string = Array.isArray(message.content)
    ? message.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
    : String(message.content);

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
    : (process.env.OPENAI_MODEL || "llama-3.3-70b-versatile");

  // Lấy cấu hình hệ thống
  const [dbSystemPrompt, rawEnableTranslate, rawEnableRag] = await Promise.all([
    dbConnection.settings.get("SYSTEM_PROMPT"),
    dbConnection.settings.get("ENABLE_TOOL_TRANSLATE"),
    dbConnection.settings.get("ENABLE_TOOL_RAG_SEARCH")
  ]);

  let resolvedSystemPrompt = dbSystemPrompt || "Bạn là trợ lý ảo MES Buddy, giúp giải quyết các công việc trong hệ thống. Bạn mang phong cách như một đồng nghiệp thông minh, thân thiện.";

  let isSlashCommand = false;

  // --- XỬ LÝ SLASH COMMANDS ---
  if (typeof cleanMessageContent === "string") {
    const trimmedContent = cleanMessageContent.trim();
    if (trimmedContent === "/summarize" || trimmedContent === "[Summarize]") {
      isSlashCommand = true;
      resolvedSystemPrompt = "Bạn là trợ lý AI súc tích. Nhiệm vụ DUY NHẤT của bạn hiện tại là TÓM TẮT toàn bộ nội dung cuộc trò chuyện ở trên một cách rõ ràng và ngắn gọn nhất bằng các gạch đầu dòng. KHÔNG tự đưa ra câu trả lời mới, chỉ TÓM TẮT.";
    } 
    else if (trimmedContent.startsWith("/search ") || trimmedContent.startsWith("[Search] ")) {
      isSlashCommand = true;
      const query = trimmedContent.replace(/^(\/search|\[Search\])\s+/i, '').trim();
      resolvedSystemPrompt = "Người dùng đang yêu cầu tìm kiếm tri thức nội bộ. Hiện tại tính năng RAG đang trong giai đoạn phát triển và mô phỏng. Hãy báo rằng bạn đã ghi nhận từ khoá tìm kiếm, liệt kê lại nó một cách trang trọng và đưa ra một vài ví dụ ngẫu nhiên mô phỏng quá trình tìm kiếm.";
      // Xoá trigger command khỏi phần LLM tiếp nhận
      if (Array.isArray(apiMessages[apiMessages.length - 1].content)) {
         apiMessages[apiMessages.length - 1].content = apiMessages[apiMessages.length - 1].content.map((c: any) => c.type === "text" ? { type: "text", text: `Tìm kiếm thông tin: ${query}` } : c);
      } else {
         apiMessages[apiMessages.length - 1].content = `Tìm kiếm thông tin: ${query}`;
      }
      cleanMessageContent = `Tìm kiếm thông tin: ${query}`;
    }
    else if (trimmedContent.startsWith("/translate ") || trimmedContent.startsWith("[Translate ")) {
      // parse định dạng: "/translate Tiếng Việt:\n<nội-dung-cần-dịch>" hoặc "[Translate English]:\n..."
      const match = trimmedContent.match(/^(?:\/translate|\[Translate)\s+(.*?)\]?:\s*([\s\S]*)$/i);
      if (match) {
        isSlashCommand = true;
        const lang = match[1].trim();
        const bodyContent = match[2].trim();
        resolvedSystemPrompt = `Bạn là một biên dịch viên ngôn ngữ bản xứ chuyên nghiệp. Người dùng muốn bạn dịch văn bản sang ngôn ngữ: **${lang}**.\n\nCHỈ TRẢ VỀ bản dịch sạch sẽ trực tiếp, TUYỆT ĐỐI KHÔNG giải thích, KHÔNG thêm lời chào, KHÔNG bình luận thêm bất cứ từ nào ngoài bản dịch, KHÔNG bọc bản dịch trong dấu ngoặc kép hoặc các ký tự định dạng. Dịch một cách tự nhiên và chính xác nhất sát ngữ cảnh.`;
        
        // Đảm bảo LLM chỉ nhận đúng nội dung cần dịch
        const targetContent = `Văn bản cần dịch sang ngôn ngữ ${lang}:\n\n${bodyContent || "(Trống)"}`;
        if (Array.isArray(apiMessages[apiMessages.length - 1].content)) {
           apiMessages[apiMessages.length - 1].content = apiMessages[apiMessages.length - 1].content.map((c: any) => c.type === "text" ? { type: "text", text: targetContent } : c);
        } else {
           apiMessages[apiMessages.length - 1].content = targetContent;
        }
        cleanMessageContent = bodyContent || "Dịch thuật";
      }
    }
  }

  const activeTools = { ...frontendTools(tools ?? {}) };

  if (rawEnableTranslate === "false" || rawEnableTranslate === "0") {
    // Nếu có tool dịch và đang bị tắt, xoá nó để LLM không gọi được
    if (activeTools.translate) delete activeTools.translate;
  }
  if (rawEnableRag === "false" || rawEnableRag === "0") {
    if (activeTools.rag_search) delete activeTools.rag_search;
    if (activeTools.ragSearch) delete activeTools.ragSearch;
  }

  const finalSystemPrompt = isSlashCommand 
    ? resolvedSystemPrompt 
    : `Role: You are the SDV MES Portal AI Assistant. You are chatting with: ${userName} (Email: ${email}). ${resolvedSystemPrompt}\n\n[USER MEMORY CONTEXT]\nHere are the extracted user memories retrieved for this conversation:\n${memoryContextStr}\n[END MEMORY CONTEXT]`;

  const result = streamText({
    model: openai.chat(selectedModel),
    messages: apiMessages,
    system: finalSystemPrompt,
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
