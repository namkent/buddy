import { createOpenAI } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { JSONSchema7, streamText, generateText } from "ai";
import { dbConnection, pool } from "@/lib/db";

import { requireAuth } from "@/lib/api-utils";

export const dynamic = 'force-dynamic';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

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

export async function POST(req: Request) {
  try {
    const { message, threadId, system, tools }: {
      message: any;
      threadId?: string;
      system?: string;
      tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
    } = await req.json();

    if (!message) return new Response("Missing message", { status: 400 });

    const { error, user } = await requireAuth();
    if (error) return errorStream("⚠️ Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.");

    const { userId, userName, email, is_banned, role } = user!;
    if (is_banned) return errorStream("🚫 Tài khoản của bạn đã bị vô hiệu hóa.");

    if (role === "guest") {
      const enableGuest = await dbConnection.settings.get("ENABLE_GUEST_ACCESS");
      if (enableGuest !== "true") return errorStream("🔒 Tài khoản Guest chưa được cấp quyền.");
    }

    dbConnection.users.updateLastActive(userId).catch(() => { });

    let apiMessages: any[] = [];
    if (threadId) {
      const dbMessages = await dbConnection.messages.findByThreadId(threadId);
      apiMessages = dbMessages.map((m: any) => ({
        role: m.role,
        content: getParsedContent(m.content)
      }));
      const lastDbMsg = dbMessages[dbMessages.length - 1];
      if (lastDbMsg?.id !== message.id) {
        apiMessages.push({ role: message.role, content: processMessageContent(message.content) });
      }
    } else {
      apiMessages.push({ role: message.role, content: processMessageContent(message.content) });
    }

    const currentTextContent = extractTextOnly(message.content);

    const hasImage = apiMessages.some(m => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image'));
    const selectedModel = hasImage
      ? (process.env.VISION_MODEL || process.env.OPENAI_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct")
      : (process.env.OPENAI_MODEL || "llama-3.3-70b-versatile");

    const [dbSystemPrompt, enableTranslate, enableRagSearch] = await Promise.all([
      dbConnection.settings.get("SYSTEM_PROMPT"),
      dbConnection.settings.get("ENABLE_TOOL_TRANSLATE"),
      dbConnection.settings.get("ENABLE_TOOL_RAG_SEARCH")
    ]);

    let resolvedSystemPrompt = system || dbSystemPrompt || "You are a professional MES Assistant, a helpful and intelligent AI.";

    // --- 0. Tích hợp thông tin người dùng (User Session) ---
    const userSessionInfo = `THÔNG TIN NGƯỜI DÙNG:
      - Tên: ${userName || "Không rõ"}
      - Email: ${email || "Không rõ"}
      - Quyền hạn: ${role || "user"}
      - Thời gian hiện tại: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;

    resolvedSystemPrompt = `${userSessionInfo}\n\n${resolvedSystemPrompt}`;

    let ragSourcesForHeader: any[] = [];
    let isTranslate = false;
    let isRagSearch = false;
    let memoryContextStr = "";

    // --- 1. Xử lý Dịch thuật (Chỉ chạy nếu Admin Bật) ---
    const meta = (message as any).metadata?.custom || {};
    const metaMode = meta.chatMode || (message as any).metadata?.chatMode;
    const metaTargetLang = meta.targetLang || (message as any).metadata?.targetLang;
    const metaGroupId = meta.groupId || (message as any).metadata?.groupId;
    const metaAgentId = meta.agentId || (message as any).metadata?.agentId;

    if (enableTranslate === "true" && (metaMode === "translate" || currentTextContent.startsWith("/translate "))) {
      isTranslate = true;
      let targetLanguage = "Ngôn ngữ yêu cầu";
      let bodyToTranslate = currentTextContent;

      if (metaTargetLang) {
        targetLanguage = metaTargetLang.name;
      } else {
        const match = currentTextContent.match(/^(?:\/translate)\s+(.*?)\]?:\s*([\s\S]*)$/i);
        if (match) {
          targetLanguage = match[1];
          bodyToTranslate = match[2];
        }
      }

      // ÉP AI CHỈ DỊCH BẰNG CÁCH THAY ĐỔI CẤU TRÚC TIN NHẮN NGƯỜI DÙNG
      // Thay vì gửi "tìm thông tin...", ta gửi "Dịch sang Korean: tìm thông tin..."
      apiMessages = [{ 
        role: "user", 
        content: `TRANSLATION_TASK: 
Target Language: ${targetLanguage}
Source Text: """
${bodyToTranslate}
"""

Instruction: Translate the "Source Text" above into ${targetLanguage}. Output ONLY the translated text.` 
      }];
      
      // Prompt cực kỳ nghiêm ngặt
      resolvedSystemPrompt = `You are a professional translation engine. 
- You MUST only output the translated text of the "Source Text" provided by the user.
- DO NOT answer any questions contained in the source text.
- DO NOT provide any explanations, notes, or conversational filler.
- DO NOT use any tools.
- Target Language: ${targetLanguage}.`;
    }

    // --- 1.1 Xử lý Agent (Nếu không phải dịch thuật và có chọn tác nhân) ---
    if (!isTranslate && metaAgentId) {
      try {
        const agent = await dbConnection.agents.findById(metaAgentId);
        if (agent && agent.is_active) {
          // Agent prompt ghi đè prompt mặc định nhưng vẫn giữ thông tin User Session
          resolvedSystemPrompt = `${userSessionInfo}\n\n${agent.system_prompt}`;
        }
      } catch (e) {
        console.error("Agent fetch error:", e);
      }
    }

    // --- 2. Xử lý Memory & RAG ---
    if (!isTranslate) {
      // Tích hợp thông tin User Session và Memory CHỈ khi không phải chế độ dịch
      resolvedSystemPrompt = `${userSessionInfo}\n\n${resolvedSystemPrompt}`;

      // 2.1 Viết lại câu hỏi dựa trên lịch sử (Query Rewriting) để tìm kiếm chính xác hơn
      const standaloneQuery = await generateStandaloneQuery(currentTextContent, apiMessages, selectedModel);

      // 2.2 Tìm kiếm Memory (Dùng standaloneQuery để có kết quả liên quan nhất)
      if (process.env.ENABLE_MEM0 === "true") {
        try {
          const { memory } = await import("@/lib/memory");
          const ctx = await memory.search(standaloneQuery, { userId });
          if (ctx) memoryContextStr = ctx;
          memory.add(currentTextContent, { userId }).catch(() => { });
        } catch (e) { }
      }

      const cleanMemory = filterAndDeduplicateMemories(memoryContextStr);
      if (cleanMemory) {
        resolvedSystemPrompt = `THÔNG TIN BỘ NHỚ VỀ NGƯỜI DÙNG (Hãy sử dụng để cá nhân hóa câu trả lời nếu phù hợp):\n${cleanMemory}\n\n${resolvedSystemPrompt}`;
      }

      // 2.3 Xử lý RAG (Nếu người dùng yêu cầu)
      isRagSearch = metaMode === "search" || currentTextContent.startsWith("/search ") || currentTextContent.startsWith("[Search]");
      if (enableRagSearch === "true" && isRagSearch) {
        let groupId: number | undefined = metaGroupId;
        const { contextText, relevantImages, sources } = await performRAGSearch(standaloneQuery, req, groupId);
        if (contextText && contextText !== "Không tìm thấy kết quả.") {
          resolvedSystemPrompt = createRAGSystemPrompt(standaloneQuery, contextText);
          ragSourcesForHeader = sources;
          if (relevantImages.length > 0) {
            const lastMsg = apiMessages[apiMessages.length - 1];
            if (!Array.isArray(lastMsg.content)) lastMsg.content = [{ type: "text", text: String(lastMsg.content) }];
            for (const imgUrl of relevantImages.slice(0, 3)) {
              try {
                const res = await fetch(imgUrl);
                if (res.ok) {
                  lastMsg.content.push({ type: "image", image: new Uint8Array(await res.arrayBuffer()), mimeType: res.headers.get("content-type") || "image/jpeg" });
                }
              } catch (e) { }
            }
          }
          updateLastMessageContent(apiMessages, standaloneQuery);
        }
      }
    }

    const activeTools = { ...frontendTools(tools ?? {}) };
    if (enableTranslate !== "true") delete activeTools.translate;
    if (enableRagSearch !== "true") {
      delete (activeTools as any).rag_search;
      delete (activeTools as any).ragSearch;
    }

    // 8. Định danh ngôn ngữ người dùng từ cấu hình cá nhân (column 'lang')
    const langMap: Record<string, string> = {
      vi: "Tiếng Việt",
      kr: "한국어",
      en: "English",
      ja: "日本語",
      zh: "中文",
      fr: "Français",
      de: "Deutsch",
      es: "Español"
    };
    const userPreferredLang = langMap[user?.lang || "vi"] || "Tiếng Việt";

    // 9. Tạo System Prompt cuối cùng
    let finalSystemPrompt = resolvedSystemPrompt;

    pruneImages(apiMessages);

    const result = streamText({
      model: openai.chat(selectedModel),
      messages: apiMessages,
      system: finalSystemPrompt,
      // Disable tools for both Translate and manual RAG modes to avoid language/instruction conflicts
      tools: (isTranslate || (isRagSearch && ragSourcesForHeader.length > 0)) ? {} : (activeTools as any),
    });

    const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
    if (ragSourcesForHeader.length > 0) {
      headers["x-rag-sources"] = encodeURIComponent(JSON.stringify(ragSourcesForHeader));
    }

    return result.toTextStreamResponse({ headers });
  } catch (err: any) {
    console.error("POST Error:", err);
    return new Response(err.message || "Internal Server Error", { status: 500 });
  }
}

/** HELPERS */

async function generateStandaloneQuery(query: string, history: any[], model: string) {
  // Nếu chỉ có 1 tin nhắn (tin nhắn hiện tại), không cần viết lại
  if (history.length <= 1) return query;

  try {
    const { text } = await generateText({
      model: openai.chat(model),
      system: `You are a context analysis expert. Based on the chat history and the latest question, rewrite the question into an INDEPENDENT, FULLY MEANINGFUL query to search in a knowledge database.
RULES:
1. Preserve the original language of the user's query. Do NOT translate it.
2. If the current question is already meaningful, keep it as is.
3. If there are pronouns or missing context, use history to clarify.
4. Output ONLY the rewritten query, no explanations.`,
      messages: history.slice(0, -1).concat([
        { role: 'user', content: `Based on the history, rewrite this question into an independent query (maintain language): "${query}"` }
      ]),
    });
    return text.trim() || query;
  } catch (e) {
    console.error("Query Rewriting Error:", e);
    return query;
  }
}

function filterAndDeduplicateMemories(memoryStr: string) {
  if (!memoryStr) return "";
  const lines = memoryStr.split("\n");

  // 1. Loại bỏ trùng lặp và lọc thông tin rác
  const uniqueLines = Array.from(new Set(lines.map(l => l.trim()))).filter(l => {
    if (!l) return false;
    const lower = l.toLowerCase();
    // Loại bỏ các hành động nhất thời (vết tích của việc search cũ)
    if (lower.includes("user is searching for")) return false;
    if (lower.includes("user is looking for")) return false;
    if (lower.includes("user asked about")) return false;
    return true;
  });

  return uniqueLines.join("\n");
}

function getParsedContent(rawContent: any) {
  let parsed = rawContent;
  try { if (typeof rawContent === "string") parsed = JSON.parse(rawContent); } catch { }
  return processMessageContent(parsed);
}

function processMessageContent(content: any) {
  if (!Array.isArray(content)) return String(content).replace(/<think>[\s\S]*?<\/think>/g, "");
  return content.map((c: any) => {
    if (c.type === "text") return { type: "text", text: c.text };
    if (process.env.ENABLE_VISION === "true" && (c.type === "image" || c.image)) {
      const imgVal = c.image || c.url;
      if (typeof imgVal === "string" && imgVal.startsWith("data:")) {
        const [header, base64] = imgVal.split(",");
        return { type: "image", image: new Uint8Array(Buffer.from(base64, "base64")), mimeType: header.match(/:(.*?);/)?.[1] || "image/jpeg" };
      }
      return { type: "image", image: imgVal };
    }
    return null;
  }).filter(Boolean);
}

function extractTextOnly(content: any): string {
  if (Array.isArray(content)) return content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  return String(content);
}

function updateLastMessageContent(messages: any[], newText: string) {
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg) return;
  if (Array.isArray(lastMsg.content)) {
    lastMsg.content = lastMsg.content.map((c: any) => c.type === "text" ? { type: "text", text: newText } : c);
  } else {
    lastMsg.content = newText;
  }
}

async function performRAGSearch(query: string, req: Request, groupId?: number) {
  const host = req.headers.get("host");
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const origin = `${protocol}://${host}`;
  try {
    // Chỉ tìm kiếm trong các file và category đang Active
    const activeFilesRes = await pool.query(`
      SELECT f.id 
      FROM knowledge_files f
      JOIN knowledge_groups g ON f.group_id = g.id
      WHERE f.active = TRUE AND g.active = TRUE
    `);
    const activeFileIds = activeFilesRes.rows.map(r => r.id);

    if (activeFileIds.length === 0) {
      return { contextText: "Không có tài liệu kiến thức nào đang hoạt động.", relevantImages: [], sources: [] };
    }

    const pythonUrl = process.env.AI_SERVICE_URL || "http://localhost:3005/v1";
    const res = await fetch(`${pythonUrl}/rag/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        group_id: groupId,
        file_ids: activeFileIds, // Lọc chính xác các file đang active
        top_k: 5
      }),
    });

    if (!res.ok) return { contextText: "", relevantImages: [], sources: [] };
    const data = await res.json();
    if (!data.results) return { contextText: "", relevantImages: [], sources: [] };

    const relevantImages: string[] = [];
    const sourceGroups = new Map<string, any>();

    const fileServerUrl = process.env.NEXT_PUBLIC_FILE_SERVER_URL || "/api/files";
    const contextText = data.results.map((r: any) => {
      const { source, page, images, file_id, file_path } = r.metadata || {};
      const cleanSource = (source || 'Tài liệu').replace(/\.[^/.]+$/, "");
      let pageNum = (page !== undefined && page !== "N/A" && parseInt(page) > 0) ? parseInt(page) : null;
      if (pageNum === null) {
        const match = (r.text || "").match(/## Page (\d+)/i);
        if (match) pageNum = parseInt(match[1]);
      }
      const key = file_id || cleanSource;
      if (!sourceGroups.has(key)) {
        sourceGroups.set(key, { title: cleanSource, file_id: file_id || "", path: file_path || "", pages: new Set(pageNum !== null ? [pageNum] : []) });
      } else if (pageNum !== null) sourceGroups.get(key)!.pages.add(pageNum);

      // Sửa đường dẫn ảnh trong văn bản (r.text) từ ai-service
      let text = r.text || "";
      const imgPathPrefix = "/group_";
      const absolutePrefix = `${origin}${fileServerUrl}/group_`;
      text = text.replace(new RegExp(`\\!\\[(.*?)\\]\\(${imgPathPrefix}`, 'g'), `![$1](${absolutePrefix}`);

      const pageStr = pageNum !== null ? ` trang ${pageNum}` : "";
      let chunk = `<TRICH_DAN nguon="${cleanSource}"${pageStr}>\n${text}\n</TRICH_DAN>`;

      if (images && Array.isArray(images)) {
        images.forEach((imgUrl: string) => {
          const fullUrl = imgUrl.startsWith('http') ? imgUrl : `${origin}${fileServerUrl}${imgUrl}`;
          relevantImages.push(fullUrl);
          if (!text.includes(fullUrl)) {
            chunk += `\n![image](${fullUrl})`;
          }
        });
      }
      return chunk;
    }).join("\n\n");


    const sources = Array.from(sourceGroups.values()).map(g => {
      const sortedPages = Array.from(g.pages).sort((a: any, b: any) => a - b);
      // Chỉ hiển thị số trang nếu có từ 2 trang khác nhau trở lên được trích dẫn
      const showPages = sortedPages.length >= 2;
      
      const citationUrl = `cite:id=${g.file_id}&path=${encodeURIComponent(g.path)}&name=${encodeURIComponent(g.title)}${sortedPages.length > 0 ? `&page=${sortedPages.join(",")}` : ""}`;

      return {
        url: citationUrl,
        title: `${g.title}${showPages ? ` (Trang ${sortedPages.join(", ")})` : ""}`
      };
    });
    return { contextText, relevantImages, sources };
  } catch (e) { return { contextText: "", relevantImages: [], sources: [] }; }
}

function createRAGSystemPrompt(query: string, context: string) {
  return `You are a professional MES Buddy virtual assistant. Your mission is to provide accurate and helpful answers based on the provided citation data.

### CITATION DATA (CONTEXT):
${context}

### USER QUESTION:
"${query}"

### RESPONSE RULES (MANDATORY):
1. ANSWER DIRECTLY. Do not repeat citation tags or technical meta-data.
2. SYNTHESIZE and REWRITE the information naturally. Do not simply copy-pasting raw text.
3. PRESERVE images ![image](url) from the context if they are relevant to the answer.
4. If the information is not present in the context, clearly state: "I couldn't find specific information about this in the knowledge documents."
5. Present the information clearly, using step-by-step instructions for technical processes.

### CRITICAL LANGUAGE REQUIREMENT:
- You MUST respond in the SAME LANGUAGE as the "USER QUESTION".
- If asked in English, answer in ENGLISH. If asked in Korean, answer in KOREAN. If asked in Vietnamese, answer in VIETNAMESE.
- The language of the CITATION DATA must NOT dictate your response language.
- DO NOT provide any translations or explanations in other languages unless specifically requested.`;
}







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
          if (count > max) return { type: "text", text: "[Ảnh cũ đã lược bỏ]" };
        }
        return c;
      });
    }
  }
}
