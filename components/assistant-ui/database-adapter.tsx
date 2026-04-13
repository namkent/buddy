"use client";

import {
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
  type ChatModelAdapter
} from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";

export const createChatModelAdapter = (getThreadId: () => string | undefined): ChatModelAdapter => ({
  async *run({ messages, abortSignal }) {
    const threadId = getThreadId();
    const lastMessage = messages[messages.length - 1];

    const userMessages = messages.filter(m => m.role === "user");
    if (userMessages.length > 1 && userMessages.length % 5 === 0 && threadId && !threadId.startsWith("__LOCALID_")) {
      // Delay it by 500ms to ensure the main chat fetch starts first without NextJS queuing blocks
      setTimeout(() => {
        (async () => {
          try {
            const recentMessages = messages
              .slice(-20)
              .map(m => {
                const content = Array.isArray(m.content) 
                  ? m.content.map((c: any) => c.text || "").join("") 
                  : typeof m.content === 'string' ? m.content : "";
                return `${m.role}: ${content}`;
              })
              .join("\n");
              
            const titleRes = await fetch("/api/chat/title", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: recentMessages, isPeriodic: true })
            });
            
            if (!titleRes.ok) return;
            const titleData = await titleRes.json();
            
            if (titleData.title) {
              const cleanTitle = titleData.title.trim().replace(/^["']|["']$/g, '');
              await fetch("/api/chat/threads", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: threadId, data: { title: cleanTitle } }),
              });
              // Dispatch event to refresh thread list
              window.dispatchEvent(new CustomEvent('meshbuddy-refresh-threads', {
                detail: { threadId, title: cleanTitle }
              }));
            }
          } catch (e) {
            console.error("Auto rename failed", e);
          }
        })();
      }, 500);
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: lastMessage, threadId }),
      signal: abortSignal,
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullText = "";

    const startTime = Date.now();
    let firstTokenTime: number | undefined;
    let totalChunks = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (fullText) {
          const totalStreamTime = Date.now() - startTime;
          const tokensPerSecond = (fullText.length / 4) / (totalStreamTime / 1000);
          yield {
            content: [{ type: "text", text: fullText }],
            metadata: {
              timing: {
                streamStartTime: startTime,
                firstTokenTime,
                totalStreamTime,
                tokensPerSecond,
                totalChunks,
                toolCallCount: 0
              }
            }
          };
        }
        break;
      }

      totalChunks++;
      if (totalChunks === 1) {
        firstTokenTime = Date.now() - startTime;
      }

      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      
      const totalStreamTime = Date.now() - startTime;
      const tokensPerSecond = totalStreamTime > 0 ? (fullText.length / 4) / (totalStreamTime / 1000) : 0;
      
      let contentParts: any[] = [];
      const thinkStart = fullText.indexOf("<think>");
      const thinkEnd = fullText.indexOf("</think>");

      if (thinkStart !== -1) {
        if (thinkStart > 0) {
           contentParts.push({ type: "text", text: fullText.substring(0, thinkStart) });
        }
        if (thinkEnd !== -1) {
           contentParts.push({ type: "reasoning", text: fullText.substring(thinkStart + 7, thinkEnd).trimStart() });
           const mainText = fullText.substring(thinkEnd + 8);
           if (mainText.length > 0) {
              contentParts.push({ type: "text", text: mainText });
           }
        } else {
           contentParts.push({ type: "reasoning", text: fullText.substring(thinkStart + 7).trimStart() });
        }
      } else {
        contentParts.push({ type: "text", text: fullText });
      }

      yield { 
        content: contentParts,
        metadata: { 
          timing: { 
            streamStartTime: startTime, 
            firstTokenTime, 
            totalStreamTime, 
            tokensPerSecond, 
            totalChunks, 
            toolCallCount: 0 
          } 
        }
      };
    }
  }
});

export const myThreadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const res = await fetch("/api/chat/threads");
    const threads = await res.json();
    return {
      threads: threads.map((t: any) => ({
        status: t.archived ? "archived" : "regular",
        remoteId: t.id,
        title: t.title,
        externalId: t.id,
      })),
    };
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

export const createHistoryAdapter = (remoteId?: string): ThreadHistoryAdapter => ({
  async load() {
    if (!remoteId) return { messages: [] };
    const res = await fetch(`/api/chat/messages?threadId=${remoteId}`);
    const messages = await res.json();
    return {
      messages: messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: [{ type: "text", text: m.content }],
        createdAt: new Date(m.createdAt),
      })),
    };
  },

  async append(rawMessage: any) {
    if (!remoteId) return;
    const message = 'message' in rawMessage ? rawMessage.message : rawMessage;
    await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...message, thread_id: remoteId }),
    });
  },
});