"use client";

import {
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
  type ChatModelAdapter
} from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";

export const myChatModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: abortSignal,
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      yield { content: [{ type: "text", text: fullText }] };
    }
  },
};

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
    const res = await fetch("/api/chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: threadId }),
    });
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
    const title = text.substring(0, 30);
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
    if (!remoteId || remoteId.startsWith("__LOCALID_")) return { messages: [] };
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

  async append(message) {
    if (!remoteId) return;
    await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...message, thread_id: remoteId }),
    });
  },
});