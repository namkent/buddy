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
import {LanguageToggle} from "@/components/ui/language-toggle";
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
    threadId: initialThreadId,
    runtimeHook: () => {
      const threadListItem = useAui().threadListItem();
      
      const modelAdapter = useMemo(() => {
        return createChatModelAdapter(() => {
          const state = threadListItem.getState();
          return state.remoteId || state.externalId;
        });
      }, [threadListItem]);

      const historyAdapter = useMemo(() => {
        return createHistoryAdapter(() => {
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
          feedback: feedbackAdapter,
          history: historyAdapter,
        } 
      });
    },
    adapter: myThreadListAdapter,
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
              <div className="ml-auto flex items-center gap-2">
                <LanguageToggle/>
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
  const mainThreadId = useAuiState((s) => s.threads.mainThreadId);

  // 1. Cập nhật URL khi mainThreadId thay đổi (chọn thread trong sidebar)
  useEffect(() => {
    if (mainThreadId && !mainThreadId.startsWith("__LOCALID_")) {
      const currentPath = window.location.pathname;
      const targetPath = `/app/${mainThreadId}`;
      if (currentPath !== targetPath && currentPath.startsWith("/app/")) {
        window.history.pushState({}, "", targetPath);
      }
    }
  }, [mainThreadId]);

  // 2. Đồng bộ tên thread từ event (rename)
  useEffect(() => {
    const handleThreadUpdated = (e: Event) => {
      const { threadId, title } = (e as CustomEvent<{ threadId: string, title: string }>).detail;
      try {
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
