"use client";

import {
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
  type ChatModelAdapter
} from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";

const compressImage = (file: File, maxWidth = 1024, quality = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

const processMessageAttachments = async (message: any) => {
  if (message.role !== "user") return message.content;
  
  const attachments = (message as any).attachments || [];
  if (attachments.length === 0) return message.content;

  const attachmentParts = await Promise.all(
    attachments.map(async (attachment: any) => {
      if (attachment.type === "image" && attachment.file) {
        try {
          const base64 = await compressImage(attachment.file);
          return { type: "image", image: base64 };
        } catch (e) {
          console.error("Image conversion failed", e);
          return null;
        }
      }
      if (attachment.type === "document" && attachment.file) {
        if (attachment.file.name.endsWith(".txt")) {
          try {
            const text = await attachment.file.text();
            return { type: "text", text: `[Attached File: ${attachment.file.name}]\n${text}` };
          } catch (e) {
            console.error("Text file read failed", e);
          }
        } else {
          return { type: "text", text: `[Attached File: ${attachment.file.name}]` };
        }
      }
      return null;
    })
  );

  const validParts = attachmentParts.filter(Boolean);
  let processedContent = message.content;
  if (validParts.length > 0) {
    if (typeof processedContent === "string") {
      processedContent = [{ type: "text", text: processedContent }, ...validParts];
    } else if (Array.isArray(processedContent)) {
      processedContent = [...processedContent, ...validParts];
    }
  }
  return processedContent;
};

export const createChatModelAdapter = (getThreadId: () => string | undefined): ChatModelAdapter => ({
  async *run({ messages, abortSignal }) {
    const threadId = getThreadId();
    const lastMessage = messages[messages.length - 1];

    // Get current message with attachments
    const processedContent = await processMessageAttachments(lastMessage);

    const startTime = Date.now();
    let firstTokenTime = 0;
    let chunkCount = 0;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        message: { 
          ...lastMessage, 
          content: processedContent 
        }, 
        threadId 
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullText = "";
    
    // Đọc nguồn RAG từ Header (đã được tối ưu hóa ở Backend)
    const sourcesHeader = response.headers.get("x-rag-sources");
    const sourceParts: any[] = [];
    
    if (sourcesHeader) {
      try {
        const sources = JSON.parse(decodeURIComponent(sourcesHeader));
        for (const source of sources) {

          sourceParts.push({
            type: "source",
            url: source.url,
            title: source.title,
            sourceType: "url"
          });
        }
      } catch (e) {
        console.error("Failed to parse sources header", e);
      }
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      chunkCount++;

      if (!firstTokenTime && fullText.length > 0) {
        firstTokenTime = Date.now();
      }

      // Cập nhật UI với văn bản và nguồn
      const contentParts: any[] = [];
      
      // Xử lý thinking (phòng trường hợp AI vẫn dùng tag này)
      const thinkStart = fullText.indexOf("<think>");
      const thinkEnd = fullText.indexOf("</think>");

      if (thinkStart !== -1) {
        if (thinkStart > 0) contentParts.push({ type: "text", text: fullText.substring(0, thinkStart) });
        if (thinkEnd !== -1) {
          contentParts.push({ type: "reasoning", text: fullText.substring(thinkStart + 7, thinkEnd).trim() });
          const rest = fullText.substring(thinkEnd + 8);
          if (rest) contentParts.push({ type: "text", text: rest });
        } else {
          contentParts.push({ type: "reasoning", text: fullText.substring(thinkStart + 7).trim() });
        }
      } else {
        contentParts.push({ type: "text", text: fullText });
      }

      // Thêm nguồn vào cuối
      if (sourceParts.length > 0) {
        contentParts.push(...sourceParts);
      }

      const currentDuration = (Date.now() - startTime) / 1000;
      yield { 
        content: contentParts,
        metadata: { 
          timing: { 
            streamStartTime: startTime, 
            firstTokenTime: firstTokenTime || Date.now(), 
            totalStreamTime: Date.now() - startTime,
            tokensPerSecond: currentDuration > 0 ? (fullText.length / currentDuration) : 0,
            totalChunks: chunkCount,
            toolCallCount: 0 
          } 
        }
      };
    }
  }
});



export const myThreadListAdapter: RemoteThreadListAdapter = {
  async list() {
    try {
      const res = await fetch("/api/chat/threads");
      if (!res.ok) return { threads: [] };
      const threads = await res.json();
      if (!Array.isArray(threads)) return { threads: [] };
      return {
        threads: threads.map((t: any) => ({
          status: t.archived ? "archived" : "regular",
          remoteId: t.id,
          title: t.title,
          externalId: t.id,
        })),
      };
    } catch {
      return { threads: [] };
    }
  },

  async initialize(threadId: string) {
    const cleanId = threadId.replace(/^__LOCALID_/, "");
    const res = await fetch("/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cleanId }),
    });
    if (!res.ok) {
      // Nếu API chặn tạo thread (chưa đăng nhập, guest), cứ trả về local ID để UI tiếp tục
      return { remoteId: threadId, externalId: threadId };
    }
    const thread = await res.json();
    // Dispatch event để đồng bộ URL → /app/{threadId}
    window.dispatchEvent(
      new CustomEvent("assistant:thread-created", {
        detail: { threadId: thread.id },
      })
    );
    return { remoteId: thread.id, externalId: thread.id };
  },

  async fetch(remoteId: string) {
    const res = await fetch(`/api/chat/threads?id=${remoteId}`);
    const thread = await res.json();
    return {
      remoteId: thread.id,
      title: thread.title,
      status: thread.archived ? "archived" : "regular",
      externalId: thread.id,
    };
  },

  async rename(remoteId: string, newTitle: string) {
    await fetch("/api/chat/threads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: remoteId, data: { title: newTitle } }),
    });
    // Bắn event để đồng bộ UI ngay lập tức
    window.dispatchEvent(new CustomEvent('assistant:thread-updated', {
      detail: { threadId: remoteId, title: newTitle }
    }));
  },

  async archive(remoteId: string) {
    await fetch("/api/chat/threads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: remoteId, data: { archived: true } }),
    });
  },

  async unarchive(remoteId: string) {
    await fetch("/api/chat/threads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: remoteId, data: { archived: false } }),
    });
  },

  async delete(remoteId: string) {
    await fetch(`/api/chat/threads?id=${remoteId}`, { method: "DELETE" });
  },

  async generateTitle(remoteId: string, messages: any) {
    const text = messages[0]?.content[0]?.text || "New Chat";
    let title = "New Chat";
    
    try {
      if (text !== "New Chat") {
        const titleRes = await fetch("/api/chat/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text })
        });
        const titleData = await titleRes.json();
        if (titleData.title) {
          title = titleData.title.trim().replace(/^["']|["']$/g, '');
        } else {
          title = text.substring(0, 30);
        }
      }
    } catch {
      title = text.substring(0, 30);
    }

    await fetch("/api/chat/threads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: remoteId, data: { title } }),
    });
    
    return createAssistantStream((controller) => {
      controller.appendText(title);
      controller.close();
    });
  },
};

const formatMessages = (messages: any[]) => {
  let lastId: string | null = null;
  return messages.map((m: any) => {
    const isAssistant = m.role === "assistant";
    let contentParts: any[] = [];
    let fullText = String(m.content || "");

    // Tiền xử lý nội dung

    let isJsonArray = false;
    const attachments: any[] = [];
    try {
      const parsed = JSON.parse(fullText);
      if (Array.isArray(parsed)) {
        contentParts = parsed.filter((c: any) => {
          if (c.type === "image") {
            attachments.push({
              id: Math.random().toString(36).substring(7),
              type: "image",
              name: "",
              content: [{ type: "image", image: c.image }],
              status: { type: "complete" }
            });
            return false;
          }
          return true;
        });
        isJsonArray = true;
      }
    } catch {}

    if (!isJsonArray) {
      const thinkStart = fullText.indexOf("<think>");
      const thinkEnd = fullText.indexOf("</think>");

      if (thinkStart !== -1) {
        if (thinkStart > 0) contentParts.push({ type: "text", text: fullText.substring(0, thinkStart) });
        if (thinkEnd !== -1) {
          contentParts.push({
            type: "reasoning",
            text: fullText.substring(thinkStart + 7, thinkEnd).trim()
          });
          const mainText = fullText.substring(thinkEnd + 8).trim();
          if (mainText.length > 0) contentParts.push({ type: "text", text: mainText });
        } else {
          contentParts.push({ type: "reasoning", text: fullText.substring(thinkStart + 7).trim() });
        }
      } else {
        contentParts.push({ type: "text", text: fullText });
      }
    }

    const item = {
      parentId: m.parentId || lastId,
      message: {
        id: m.id,
        role: m.role,
        content: contentParts,
        createdAt: new Date(m.createdAt),
        ...(isAssistant ? {
          status: "complete",
          metadata: {
            steps: m.steps || [],
            unstable_annotations: m.annotations || [],
          }
        } : {
          attachments: attachments,
          metadata: {}
        })
      }
    };
    lastId = m.id;
    return item;
  });
};

const historyCache = new Map<string, any[]>();

export const createHistoryAdapter = (getId: () => string | undefined): ThreadHistoryAdapter => ({
  async load() {
    const remoteId = getId();
    if (!remoteId || remoteId.startsWith("__LOCALID_")) return { messages: [] };
    
    // Check cache to make thread switching instant
    if (historyCache.has(remoteId)) {
      return { messages: historyCache.get(remoteId)! };
    }

    try {
      const res = await fetch(`/api/chat/messages?threadId=${remoteId}`);
      if (!res.ok) return { messages: [] };
      const messages = await res.json();
      const formatted = formatMessages(messages);
      
      // Update cache
      historyCache.set(remoteId, formatted);
      
      return { messages: formatted };
    } catch (e) {
      console.error("Failed to load history:", e);
      return { messages: [] };
    }
  },

  async append(rawMessage: any) {
    const remoteId = getId();
    if (!remoteId) return;
    const message = "message" in rawMessage ? rawMessage.message : rawMessage;
    
    // Only persist user messages from the frontend. 
    // Assistant messages are persisted by the backend onFinish to ensure reliability.
    if (message.role !== "user") return;

    // Clear cache for this thread so it reloads fresh next time if needed
    historyCache.delete(remoteId);

    const processedContent = await processMessageAttachments(message);

    await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...message,
        parentId: message.parentId || null,
        content: processedContent,
        thread_id: remoteId,
      }),
    });
  },
});
