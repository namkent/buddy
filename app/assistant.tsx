"use client";

import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  useRemoteThreadListRuntime,
  useLocalRuntime,
  useAui,
  RuntimeAdapterProvider,
  type ThreadHistoryAdapter
} from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

import { 
  myChatModelAdapter, 
  myThreadListAdapter, 
  createHistoryAdapter 
} from "@/components/assistant-ui/database-adapter";

export const Assistant = () => {
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: () => {
      return useLocalRuntime(myChatModelAdapter);
    },
    adapter: {
      ...myThreadListAdapter,
      unstable_Provider: ({ children }) => {
        const aui = useAui();

        const history = useMemo<ThreadHistoryAdapter>(
          () => ({
            async load() {
              const state = aui.threadListItem().getState();
              const remoteId = state.remoteId || state.externalId;
              if (!remoteId) return { messages: [] };

              const res = await fetch(`/api/chat/messages?threadId=${remoteId}`);
              const messages = await res.json();
              
              let lastId: string | null = null;
              const formattedMessages = messages.map((m: any) => {
                const isAssistant = m.role === "assistant";
                
                let contentParts: any[] = [];
                const fullText = String(m.content || "");
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
                        custom: {},
                        steps: [],
                        unstable_annotations: [],
                        unstable_data: [],
                        unstable_state: null
                      }
                    } : {
                      attachments: [],
                      metadata: {
                        custom: {}
                      }
                    })
                  }
                };
                lastId = m.id;
                return item;
              });

              return { messages: formattedMessages };
            },

            async append(message) {
              const state = aui.threadListItem().getState();
              let remoteId = state.remoteId;
              if (!remoteId) {
                const initRes = await aui.threadListItem().initialize();
                remoteId = initRes.remoteId;
              }
              const adapter = createHistoryAdapter(remoteId);
              return adapter.append(message);
            },
          }),
          [aui],
        );

        const adapters = useMemo(() => ({ history }), [history]);

        return (
          <RuntimeAdapterProvider adapters={adapters}>
            {children}
          </RuntimeAdapterProvider>
        );
      },
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <ThreadListSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink
                      href="http://sdvmes.samsungdisplay.net:9095"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      SDV MES PORTAL
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Chat Assistant</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>
            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
};
