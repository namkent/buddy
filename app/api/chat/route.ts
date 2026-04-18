import { createOpenAI } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { JSONSchema7, streamText } from "ai";
import { dbConnection } from "@/lib/db";
import { requireAuth } from "@/lib/api-utils";

/**
 * Cấu hình model OpenAI/AI service
 */
const openai = createOpenAI({
  apiKey: process.env.OPENAI_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

/**
 * Helper: Trả về lỗi dưới dạng stream để Chat UI có thể hiển thị trực tiếp trong khung chat
 */
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

/**
 * API Chat chính: Xử lý tin nhắn, nạp bộ nhớ, gọi công cụ (RAG, Translate) và stream kết quả
 */
export async function POST(req: Request) {
  // 1. Phân giải dữ liệu từ request
  const { message, threadId, system, tools }: {
    message: any;
    threadId?: string;
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  } = await req.json();

  if (!message) {
    return new Response("Missing message", { status: 400 });
  }

  // 2. Xác thực người dùng thông qua tiện ích dùng chung
  const { error, user } = await requireAuth();
  if (error) {
    // Nếu là lỗi auth, trả về dưới dạng stream để UI hiển thị thông báo đẹp mắt
    return errorStream("⚠️ Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.");
  }
  
  const { userId, userName, email, is_banned, role } = user!;

  // 3. Kiểm tra các hạn chế về tài khoản (Banned, Guest)
  if (is_banned) {
    return errorStream("🚫 Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ Admin.");
  }

  if (role === "guest") {
    const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
    if (enableGuest !== "true") {
      return errorStream("🔒 Tài khoản Guest chưa được cấp quyền sử dụng trợ lý AI. Vui lòng liên hệ Admin để phê duyệt.");
    }
  }

  // Cập nhật thời gian hoạt động cuối cùng (không đợi - fire and forget)
  dbConnection.users.updateLastActive(userId).catch(() => { });

  // 4. Khôi phục lịch sử hội thoại từ Database
  let apiMessages: any[] = [];
  if (threadId) {
    const dbMessages = await dbConnection.messages.findByThreadId(threadId);
    apiMessages = dbMessages.map((m: any) => ({
      role: m.role,
      content: getParsedContent(m.content)
    }));

    // Tránh gửi trùng tin nhắn cuối cùng nếu nó đã tồn tại trong DB
    const lastDbMsg = dbMessages[dbMessages.length - 1];
    if (lastDbMsg?.id !== message.id) {
      apiMessages.push({
        role: message.role,
        content: processMessageContent(message.content)
      });
    }
  } else {
    apiMessages.push({
      role: message.role,
      content: processMessageContent(message.content)
    });
  }

  // Lấy nội dung văn bản thuần của tin nhắn mới nhất
  const currentTextContent = extractTextOnly(message.content);

  // 5. Tích hợp bộ nhớ dài hạn Mem0 (nếu bật)
  let memoryContextStr = "";
  if (process.env.ENABLE_MEM0 === "true") {
    try {
      const { memory } = await import("@/lib/memory");
      // Tìm kiếm ngữ ký quá khứ
      const ctx = await memory.search(currentTextContent, { userId });
      if (ctx) memoryContextStr = ctx;

      // Lưu trữ thông tin mới vào bộ nhớ
      memory.add(currentTextContent, { userId }).catch((e) => console.error("Memory Add Fail:", e));
    } catch (error) {
      console.error("Memory Integration Fail:", error);
    }
  }

  // 6. Lựa chọn Model (Vision nếu có ảnh, ngược lại là model text)
  const hasImage = apiMessages.some(m => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image'));
  const selectedModel = hasImage
    ? (process.env.VISION_MODEL || process.env.OPENAI_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct")
    : (process.env.OPENAI_MODEL || "llama-3.3-70b-versatile");

  // 7. Xử lý System Prompt và Slash Commands
  const [dbSystemPrompt, rawEnableTranslate, rawEnableRag] = await Promise.all([
    dbConnection.settings.get("SYSTEM_PROMPT"),
    dbConnection.settings.get("ENABLE_TOOL_TRANSLATE"),
    dbConnection.settings.get("ENABLE_TOOL_RAG_SEARCH")
  ]);

  let resolvedSystemPrompt = system || dbSystemPrompt || "Bạn là trợ lý ảo MES Buddy thông minh, thân thiện.";
  let isSlashCommand = false;

  // Lấy Metadata gửi ngầm (ưu tiên cao nhất)
  const meta = message.metadata?.custom || {};
  const metaMode = meta.chatMode;
  const metaGroupId = meta.groupId;
  const metaTargetLang = meta.targetLang;

  // 1. Xử lý RAG (Search)
  if (metaMode === "search" || currentTextContent.startsWith("/search ") || currentTextContent.startsWith("[Search] ") || currentTextContent.startsWith("[Search Catalog: ")) {
    isSlashCommand = true;
    
    let query = currentTextContent;
    let groupId: number | undefined = metaGroupId;

    if (!groupId) {
      // Fallback for legacy string commands
      const catalogMatch = currentTextContent.match(/^\[Search Catalog: (\d+)\]\s*([\s\S]*)$/i);
      if (catalogMatch) {
        groupId = parseInt(catalogMatch[1]);
        query = catalogMatch[2].trim();
      } else {
        query = currentTextContent.replace(/^(\/search|\[Search\])\s+/i, '').trim();
      }
    }

    const { contextText, relevantImages } = await performRAGSearch(query, req, groupId);
    resolvedSystemPrompt = createRAGSystemPrompt(query, contextText);
    
    // Nếu có ảnh từ RAG, chèn chúng vào tin nhắn cuối cùng để Bot "nhìn" thấy
    if (relevantImages.length > 0) {
      const lastMsg = apiMessages[apiMessages.length - 1];
      if (!Array.isArray(lastMsg.content)) {
        lastMsg.content = [{ type: "text", text: lastMsg.content }];
      }
      
      for (const imgUrl of relevantImages.slice(0, 3)) { // Giới hạn 3 ảnh tránh overload
        try {
          const res = await fetch(imgUrl);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            const contentType = res.headers.get("content-type") || "image/jpeg";
            lastMsg.content.push({
              type: "image",
              image: new Uint8Array(buffer),
              mimeType: contentType
            });
          }
        } catch (e) {
          console.error("Fetch RAG image fail:", imgUrl, e);
        }
      }
    }

    updateLastMessageContent(apiMessages, `Câu hỏi: ${query}`);
  } 
  // 2. Xử lý Dịch thuật (Translate)
  else if (metaMode === "translate" || currentTextContent.startsWith("/translate ") || currentTextContent.startsWith("[Translate ")) {
    isSlashCommand = true;
    
    if (metaTargetLang) {
      // Ưu tiên Metadata
      resolvedSystemPrompt = `Bạn là biên dịch viên chuyên nghiệp. Dịch văn bản sau sang ${metaTargetLang.name}. CHỈ trả về bản dịch.`;
      const targetContent = `Dịch sang ${metaTargetLang.name}:\n\n${currentTextContent.trim() || "(Trống)"}`;
      updateLastMessageContent(apiMessages, targetContent);
    } else {
      // Fallback for legacy string commands
      const match = currentTextContent.match(/^(?:\/translate|\[Translate)\s+(.*?)\]?:\s*([\s\S]*)$/i);
      if (match) {
        const [_, lang, body] = match;
        resolvedSystemPrompt = `Bạn là biên dịch viên chuyên nghiệp. Dịch văn bản sau sang ${lang.trim()}. CHỈ trả về bản dịch.`;
        const targetContent = `Dịch sang ${lang}:\n\n${body.trim() || "(Trống)"}`;
        updateLastMessageContent(apiMessages, targetContent);
      }
    }
  }

  // Hậu xử lý Tools (bật/tắt theo config)
  const activeTools = { ...frontendTools(tools ?? {}) };
  if (rawEnableTranslate !== "true") delete activeTools.translate;
  if (rawEnableRag !== "true") {
    delete (activeTools as any).rag_search;
    delete (activeTools as any).ragSearch;
  }

  // 8. Tạo System Prompt cuối cùng
  const finalSystemPrompt = isSlashCommand
    ? resolvedSystemPrompt
    : `Role: Trợ lý MES Buddy đang hỗ trợ: ${userName} (${email}). ${resolvedSystemPrompt}\n\n[USER MEMORY]\n${memoryContextStr}`;

  // 9. Giới hạn số lượng ảnh gửi đi (Pruning)
  pruneImages(apiMessages);

  // 10. Gọi AI và trả về Stream
  const result = streamText({
    model: openai.chat(selectedModel),
    messages: apiMessages,
    system: finalSystemPrompt,
    tools: activeTools as any,
    providerOptions: {
      openai: { reasoningSummary: "auto" },
    },
  });

  return result.toTextStreamResponse();
}

/**
 * --- CÁC HÀM TRỢ GIÚP (HELPERS) ---
 */

// Chuyển đổi content từ DB sang định dạng AI SDK
function getParsedContent(rawContent: any) {
  let parsed = rawContent;
  try {
    if (typeof rawContent === "string") parsed = JSON.parse(rawContent);
  } catch {
    parsed = rawContent;
  }
  return processMessageContent(parsed);
}

// Xử lý logic nội dung tin nhắn (Text & Image Base64)
function processMessageContent(content: any) {
  if (!Array.isArray(content)) {
    return String(content).replace(/<think>[\s\S]*?<\/think>/g, "");
  }

  return content.map((c: any) => {
    if (c.type === "text") return { type: "text", text: c.text };
    if (process.env.ENABLE_VISION === "true" && (c.type === "image" || c.image)) {
      const imgVal = c.image || c.url;
      if (typeof imgVal === "string" && imgVal.startsWith("data:")) {
        const [header, base64] = imgVal.split(",");
        const mimeType = header.match(/:(.*?);/)?.[1] || "image/jpeg";
        return { type: "image", image: new Uint8Array(Buffer.from(base64, "base64")), mimeType };
      }
      return { type: "image", image: imgVal };
    }
    return null;
  }).filter(Boolean);
}

// Trích xuất văn bản thuần từ tin nhắn
function extractTextOnly(content: any): string {
  if (Array.isArray(content)) {
    return content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  }
  return String(content);
}

// Cập nhật nội dung tin nhắn cuối cùng trong mảng
function updateLastMessageContent(messages: any[], newText: string) {
  const lastMsg = messages[messages.length - 1];
  if (Array.isArray(lastMsg.content)) {
    lastMsg.content = lastMsg.content.map((c: any) => c.type === "text" ? { type: "text", text: newText } : c);
  } else {
    lastMsg.content = newText;
  }
}

// Thực hiện RAG search qua Python Service
async function performRAGSearch(query: string, req: Request, groupId?: number) {
  const host = req.headers.get("host");
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const origin = `${protocol}://${host}`;

  try {
    const pythonUrl = process.env.RAG_SERVICE_URL || "http://localhost:8000";
    const res = await fetch(`${pythonUrl}/rag/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        query, 
        group_id: groupId,
        top_k: 8 
      }), // Tăng top_k để bao quát văn bản dài
    });
    
    if (!res.ok) return { contextText: "Không tìm thấy kết quả.", relevantImages: [] };
    
    const data = await res.json();
    if (!data.results || data.results.length === 0) return { contextText: "Không tìm thấy kết quả.", relevantImages: [] };

    const relevantImages: string[] = [];
    const contextText = data.results.map((r: any, idx: number) => {
      const { source, page, images } = r.metadata || {};
      let chunk = `[Nguồn: ${source || 'Tài liệu hệ thống'}, Trang: ${page || 'N/A'}]:\n${r.text}`;
      
      // Xử lý danh sách ảnh từ metadata mới
      if (images && Array.isArray(images)) {
        images.forEach((imgUrl: string) => {
          const fullUrl = imgUrl.startsWith('http') ? imgUrl : `${origin}${process.env.NEXT_PUBLIC_FILE_SERVER_URL || ""}${imgUrl}`;
          relevantImages.push(fullUrl);
          chunk += `\nHình ảnh tham chiếu: ![image](${fullUrl})`;
        });
      }
      return chunk;
    }).join("\n\n");

    return { contextText, relevantImages };
  } catch (e) {
    console.error("RAG fetch fail:", e);
    return { contextText: "Lỗi kết nối dịch vụ tìm kiếm.", relevantImages: [] };
  }
}

// Tạo System Prompt cho RAG
function createRAGSystemPrompt(query: string, context: string) {
  return `Bạn là chuyên gia về văn bản pháp luật và quy trình MES. Câu hỏi: "${query}".
DỰA VÀO DỮ LIỆU CUNG CẤP SAU ĐÂY ĐỂ TRẢ LỜI:
${context}

QUY TẮC PHẢN HỒI:
1. TRÍCH DẪN NGUỒN: Bạn phải nêu rõ nguồn tài liệu và số trang khi trả lời (ví dụ: "Theo tài liệu [Tên tệp], trang [X]...").
2. ĐỘ CHÍNH XÁC: Chỉ trả lời dựa trên dữ liệu được cung cấp. Nếu không có thông tin, hãy nói rõ bạn không tìm thấy thông tin này trong hệ thống kiến thức.
3. HÌNH ẢNH: Nếu trong dữ liệu có hình ảnh (![image](url)), hãy giữ nguyên và nhúng vào câu trả lời tại vị trí phù hợp.
4. ĐỊNH DẠNG: Sử dụng danh sách (bullet points) và phân cấp rõ ràng đối với các điều khoản pháp luật hoặc quy trình nhiều bước.`;
}

// Giới hạn số lượng ảnh trong lịch sử gửi đi
function pruneImages(messages: any[]) {
  const max = parseInt(process.env.MAX_VISION_IMAGES || "0", 10);
  if (max <= 0) return;

  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (Array.isArray(msg.content)) {
      msg.content = msg.content.map((c: any) => {
        if (c.type === "image") {
          count++;
          if (count > max) return { type: "text", text: "[Ảnh cũ đã được lược bỏ]" };
        }
        return c;
      });
    }
  }
}
