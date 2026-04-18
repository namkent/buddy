import { createOpenAI } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { JSONSchema7, streamText, tool } from "ai";
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
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") {
      return errorStream("🔒 Tài khoản của bạn đang ở cấp độ **Guest** và chưa được cấp quyền sử dụng hệ thống.\n\nVui lòng liên hệ Quản trị viên để được phê duyệt quyền truy cập.");
    }
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
      
      // Perform RAG search to python service
      let ragContext = "Không có kết quả nào.";
      try {
        const pythonUrl = process.env.RAG_SERVICE_URL || "http://localhost:8000";
        const res = await fetch(`${pythonUrl}/rag/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, top_k: 5 }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            ragContext = data.results.map((r: any, idx: number) => {
              let chunkStr = `[Tài liệu ${idx + 1}]:\n${r.text}`;
              if (r.image_url) {
                const fullImageUrl = r.image_url.startsWith('http') 
                  ? r.image_url 
                  : `${process.env.NEXT_PUBLIC_FILE_SERVER_URL}${r.image_url}`;
                // Return markdown image
                chunkStr += `\nHình ảnh đính kèm: ![image](${fullImageUrl})`;
              }
              return chunkStr;
            }).join("\n\n");
          }
        }
      } catch (e) {
        console.error("RAG Search Error:", e);
      }

      console.log(`[RAG Search] Query: ${query}, Results Count: ${ragContext === "Không có kết quả nào." ? 0 : 5}`);

      resolvedSystemPrompt = `Bạn là chuyên gia RAG (Retrieval-Augmented Generation) của hệ thống SDV MES. Người dùng đang tìm kiếm thông tin với câu hỏi: "${query}".

TRÍCH DẪN TÀI LIỆU NỘI BỘ (GROUNDING DATA):
${ragContext}

QUY TẮC PHẢN HỒI (BẮT BUỘC):
1. CHỈ ĐƯỢC PHÉP dựa vào các trích dẫn trên để trả lời. 
2. NẾU CÓ HÌNH ẢNH (markdown ![image](url)) trong trích dẫn, bạn PHẢI nhúng hình ảnh đó vào vị trí phù hợp trong câu trả lời của bạn. Đây là yêu cầu quan trọng nhất để người dùng có thể hình dung được quy trình.
3. NẾU TRONG TRÍCH DẪN KHÔNG CÓ THÔNG TIN, bạn PHẢI nói: "Tôi không tìm thấy thông tin này trong hệ thống tài liệu." TUYỆT ĐỐI KHÔNG BIẠ ĐẶT.
4. Trả lời bằng ĐÚNG ngôn ngữ mà người dùng dùng để hỏi.
5. Luôn giữ thái độ chuyên nghiệp, hỗ trợ kỹ thuật tận tâm.`;

      // Xoá trigger command khỏi phần LLM tiếp nhận, chỉ truyền câu hỏi gốc
      if (Array.isArray(apiMessages[apiMessages.length - 1].content)) {
        apiMessages[apiMessages.length - 1].content = apiMessages[apiMessages.length - 1].content.map((c: any) => c.type === "text" ? { type: "text", text: `Câu hỏi: ${query}` } : c);
      } else {
        apiMessages[apiMessages.length - 1].content = `Câu hỏi: ${query}`;
      }
      cleanMessageContent = `Câu hỏi: ${query}`;
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

  console.log(`memory [${userId}] : ${memoryContextStr}`);

  const finalSystemPrompt = isSlashCommand
    ? resolvedSystemPrompt
    : `Role: You are the SDV MES Portal AI Assistant. You are chatting with: ${userName} (Email: ${email}). ${resolvedSystemPrompt}\n\n[USER MEMORY CONTEXT]\nHere are the extracted user memories retrieved for this conversation:\n${memoryContextStr}\n[END MEMORY CONTEXT]`;

  const result = streamText({
    model: openai.chat(selectedModel),
    messages: apiMessages,
    system: finalSystemPrompt,
    tools: {
      ...frontendTools(tools ?? {}),
    } as any,
    providerOptions: {
      openai: {
        // reasoningEffort: "low",
        reasoningSummary: "auto",
      },
    },
  });

  return result.toTextStreamResponse();
}
