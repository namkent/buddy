import { useAui, type ThreadHistoryAdapter } from "@assistant-ui/react";

export const myThreadHistoryAdapter: ThreadHistoryAdapter = {
  async load() {
    const aui = useAui();
    const {remoteId} = aui.threadListItem().getState();
    if (!remoteId) return {messages: []};

    const res = await fetch(`/api/chat/messages?threadId=${remoteId}`);
    const messages = await res.json();

    return {
      messages: messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: [{type: "text", text: m.content}],
        createdAt: new Date(m.createdAt),
      })),
    };
  },

  async append(message) {
    const aui = useAui();
    const {remoteId} = await aui.threadListItem().initialize();

    await fetch("/api/chat/messages", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({...message, thread_id: remoteId}),
    });
  }
}