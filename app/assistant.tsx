"use client";
import * as React from "react";

import { useMemo, useEffect } from "react";
import {
  AssistantRuntimeProvider,
  useRemoteThreadListRuntime,
  useLocalRuntime,
  useAui,
  useAuiState,
  RuntimeAdapterProvider,
  type ThreadHistoryAdapter,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter
} from "@assistant-ui/react";
import {Thread} from "@/components/assistant-ui/thread";
import {SidebarInset, SidebarProvider, SidebarTrigger} from "@/components/ui/sidebar";
import {ThreadListSidebar} from "@/components/assistant-ui/threadlist-sidebar";
import {ThemeToggle} from "@/components/assistant-ui/theme-toggle";
import {
  createChatModelAdapter,
  myThreadListAdapter,
  createHistoryAdapter
} from "@/components/assistant-ui/database-adapter";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

interface AssistantProps {
  initialThreadId?: string;
}

export const Assistant = ({ initialThreadId }: AssistantProps) => {
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: () => {
      const threadListItem = useAui().threadListItem();
      const modelAdapter = useMemo(() => {
        return createChatModelAdapter(() => {
          const state = threadListItem.getState();
          return state.remoteId || state.externalId;
        });
      }, [threadListItem]);

      const attachmentAdapter = useMemo(() => 
        new CompositeAttachmentAdapter([
          new SimpleImageAttachmentAdapter(),
          new SimpleTextAttachmentAdapter()
        ])
      , []);

      const feedbackAdapter = useMemo(() => ({
        async submit({ message, type }: { message: any, type: "positive" | "negative" }) {
          await fetch("/api/chat/messages/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              messageId: message.id, 
              feedback: type === "positive" ? 1 : -1,
              messageText: typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
            }),
          });
        }
      }), []);

      return useLocalRuntime(modelAdapter, { 
        adapters: { 
          attachments: attachmentAdapter,
          feedback: feedbackAdapter
        } 
      });
    },
    adapter: {
      ...myThreadListAdapter,
      unstable_Provider: ({children}) => {
        const threadListItem = useAui().threadListItem();

        const history = useMemo<ThreadHistoryAdapter>(
          () => ({
            async load() {
              const state = threadListItem.getState();
              const remoteId = state.remoteId || state.externalId;
              if (!remoteId) return {messages: []};

              const res = await fetch(`/api/chat/messages?threadId=${remoteId}`);
              const messages = await res.json();

              let lastId: string | null = null;
              const formattedMessages = messages.map((m: any) => {
                const isAssistant = m.role === "assistant";

                let contentParts: any[] = [];
                let fullText = String(m.content || "");
                
                // Tiền xử lý nội dung
                fullText = fullText.replace(/^\[(Search|Summarize|Translate .*?)\][:\s]*/i, "");
                
                let isJsonArray = false;
                const attachments: any[] = [];
                try {
                  const parsed = JSON.parse(fullText);
                  if (Array.isArray(parsed)) {
                    contentParts = parsed.filter(c => {
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
                  // Phân tách logic suy nghĩ (Reasoning)
                  const thinkStart = fullText.indexOf("<think>");
                  const thinkEnd = fullText.indexOf("</think>");

                  if (thinkStart !== -1) {
                    if (thinkStart > 0) {
                      contentParts.push({ type: "text", text: fullText.substring(0, thinkStart) });
                    }
                    
                    if (thinkEnd !== -1) {
                      contentParts.push({
                        type: "reasoning",
                        text: fullText.substring(thinkStart + 7, thinkEnd).trim()
                      });
                      const mainText = fullText.substring(thinkEnd + 8).trim();
                      if (mainText.length > 0) {
                        contentParts.push({ type: "text", text: mainText });
                      }
                    } else {
                      contentParts.push({ 
                        type: "reasoning", 
                        text: fullText.substring(thinkStart + 7).trim() 
                      });
                    }
                  } else {
                    contentParts.push({ type: "text", text: fullText });
                  }
                }

                const item = {
                  parentId: lastId,
                  message: {
                    id: m.id,
                    role: m.role,
                    content: contentParts,
                    createdAt: new Date(m.createdAt),
                    ...(isAssistant ? {
                      status: { type: "complete" },
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

              return { messages: formattedMessages };
            },

            async append(message) {
              const state = threadListItem.getState();
              let remoteId = state.remoteId;
              if (!remoteId) {
                const initRes = await threadListItem.initialize();
                remoteId = initRes.remoteId;
              }
              const adapter = createHistoryAdapter(remoteId);
              return adapter.append(message);
            },
          }),
          [threadListItem],
        );

        const adapters = useMemo(() => ({history}), [history]);

        return (
          <RuntimeAdapterProvider adapters={adapters}>
            {children}
          </RuntimeAdapterProvider>
        );
      },
    },
  });

  // Lắng nghe event khi thread mới được tạo (tin nhắn đầu tiên) → cập nhật URL
  useEffect(() => {
    const handleThreadCreated = (e: Event) => {
      const { threadId } = (e as CustomEvent<{ threadId: string }>).detail;
      window.history.pushState({}, "", `/app/${threadId}`);
    };

    window.addEventListener("assistant:thread-created", handleThreadCreated);
    return () => window.removeEventListener("assistant:thread-created", handleThreadCreated);
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadSync />
      <SidebarProvider>
        <div className="flex h-dvh w-full overflow-hidden">
          <ThreadListSidebar/>
          <SidebarInset className="overflow-hidden">
            <header className="flex h-16 shrink-0 items-center gap-2 px-4">
              <SidebarTrigger/>
              <div className="ml-auto">
                <ThemeToggle/>
              </div>
            </header>
            <div className="flex-1 overflow-hidden min-h-0">
              <Thread/>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
};

const ThreadSync = () => {
  const aui = useAui();
  useEffect(() => {
    const handleThreadUpdated = (e: Event) => {
      const { threadId, title } = (e as CustomEvent<{ threadId: string, title: string }>).detail;
      try {
        // useAui().threads() là cách chính thống để tương tác với thread list
        const item = aui.threads().item({ id: threadId });
        if (item) {
          item.rename(title);
        }
      } catch (err) {
        console.error("Failed to sync thread title:", err);
      }
    };

    window.addEventListener("assistant:thread-updated", handleThreadUpdated);
    return () => window.removeEventListener("assistant:thread-updated", handleThreadUpdated);
  }, [aui]);

  return null;
};
