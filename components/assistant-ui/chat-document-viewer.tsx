"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Loader2, X, FileText, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { AssistantRuntimeProvider, useLocalRuntime, TextMessagePartProvider, MessageProvider } from "@assistant-ui/react";
import remarkGfm from "remark-gfm";
import SecurePdfViewer from "./secure-pdf-viewer";

// --- Utilities ---
const encodePath = (p: string) => {
  try {
    return btoa(encodeURIComponent(p));
  } catch {
    return "";
  }
};

// --- Components ---

const ChatMarkdownViewer = React.memo(({ content, filePath }: { 
  content: string; 
  filePath: string; 
}) => {
  const runtime = useLocalRuntime({
    run: async () => ({}) as any,
  });

  const components = useMemo(() => ({
    img: ({ src, alt, ...props }: any) => {
      if (!src || typeof src !== "string") return null;
      const fileServerUrl = process.env.NEXT_PUBLIC_FILE_SERVER_URL || "/api/files";
      let fullSrc = src;
      if (!src.startsWith("http") && filePath) {
        let dir = filePath.substring(0, filePath.lastIndexOf("/"));
        if (dir.endsWith("/origin")) dir = dir.substring(0, dir.lastIndexOf("/origin"));
        const rawSrc = `${dir}/${src.startsWith("./") ? src.substring(2) : src}`;
        fullSrc = `${window.location.origin}${fileServerUrl}/encoded/${btoa(encodeURIComponent(rawSrc))}`;
      }
      return <img src={fullSrc} alt={alt ?? "image"} className="my-4 max-w-full rounded-xl border shadow-sm" {...props} />;
    },
    a: ({ href, children, ...props }: any) => {
      if (href?.startsWith("cite:")) {
        return (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              const params = new URLSearchParams(href.substring(5));
              window.dispatchEvent(new CustomEvent("open-document", {
                detail: {
                  id: parseInt(params.get("id") || "0"),
                  file_path: params.get("path"),
                  file_name: params.get("name"),
                  page: params.get("page")
                }
              }));
            }}
            className="text-indigo-600 hover:underline cursor-pointer font-medium"
            {...props}
          >
            {children}
          </a>
        );
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline" {...props}>{children}</a>;
    }
  }), [filePath]);

  const mockMessage = useMemo(() => ({
    id: "viewer-msg",
    role: "assistant" as const,
    content: [{ type: "text", text: content }],
    status: { type: "complete" } as const,
    metadata: {},
    attachments: [],
    createdAt: new Date(),
  }), [content]) as any;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MessageProvider message={mockMessage} index={0}>
        <TextMessagePartProvider text={content}>
          <div className="aui-md prose dark:prose-invert max-w-none font-sans leading-relaxed">
            <MarkdownTextPrimitive
              remarkPlugins={[remarkGfm]}
              className="prose dark:prose-invert max-w-none"
              components={components}
            />
          </div>
        </TextMessagePartProvider>
      </MessageProvider>
    </AssistantRuntimeProvider>
  );
});

ChatMarkdownViewer.displayName = "ChatMarkdownViewer";

interface ChatDocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    id: number;
    file_name: string;
    file_path: string;
    page?: string | number | null;
    created_at?: string;
  } | null;
}

export default function ChatDocumentViewer({ isOpen, onClose, file }: ChatDocumentViewerProps) {
  const [loading, setLoading] = useState(true);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (isOpen && file) {
      // Dùng file_path để bắt đuôi file chính xác hơn file_name
      const ext = file.file_path.split('.').pop()?.toLowerCase();
      setIsPdf(ext === "pdf" || ext === "docx" || ext === "doc");
      loadContent();
    } else {
      setMarkdownContent(null);
      setLoading(true);
      setIsPdf(false);
      setIsMaximized(false);
    }
  }, [isOpen, file]);

  const loadContent = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const ext = file.file_path.split('.').pop()?.toLowerCase();
      
      // Nếu là PDF hoặc Word (đã được convert sang PDF ở backend)
      if (ext === "pdf" || ext === "docx" || ext === "doc") {
        setIsPdf(true);
        setMarkdownContent(null);
        setLoading(false);
        return;
      }

      // Các trường hợp khác (MD, TXT, DOC, HTML...) - Thử tìm bản MD hoặc text
      const basePath = file.file_path.replace(/\.[^/.]+$/, "");
      const mdUrl = `/api/files/encoded/${encodePath(basePath + '.md')}`;
      const mdResponse = await fetch(mdUrl);
      
      if (mdResponse.ok) {
        const text = await mdResponse.text();
        setMarkdownContent(text);
        setIsPdf(false);
      } else {
        const res = await fetch(`/api/files/encoded/${encodePath(file.file_path)}`);
        if (res.ok) {
          const text = await res.text();
          setMarkdownContent(text);
          setIsPdf(false);
        }
      }
    } catch (err) {
      console.warn("Failed to load content", err);
    } finally {
      setLoading(false);
    }
  };

  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex flex-col p-0 gap-0 overflow-hidden bg-white dark:bg-zinc-900 border-none shadow-2xl transition-all duration-300 ease-in-out",
          isMaximized 
            ? "!w-screen !h-screen !max-w-none !rounded-none !top-0 !left-0 !translate-x-0 !translate-y-0" 
            : "sm:max-w-none w-[95vw] md:w-[80vw] lg:w-[65vw] h-[85vh] rounded-xl"
        )}
      >
        <DialogHeader className="px-6 py-4 border-b dark:border-white/10 bg-zinc-50 dark:bg-zinc-800/50 shrink-0 flex flex-row items-center justify-between">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate w-full">
              {file.file_name.replace(/\.[^/.]+$/, "")}
            </DialogTitle>
            <DialogDescription className="sr-only">Document Viewer</DialogDescription>
            {file.created_at && (
              <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
                {new Date(file.created_at).toLocaleDateString('vi-VN')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="size-8 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" 
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? "Thu nhỏ" : "Phóng to toàn màn hình"}
            >
              {isMaximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={onClose} title="Đóng">
              <X className="size-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-white dark:bg-zinc-900 custom-scrollbar relative">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-zinc-950">
              <Loader2 className="size-8 animate-spin text-orange-500" />
              <p className="text-xs text-zinc-400 mt-4">Đang tải tài liệu...</p>
            </div>
          ) : isPdf ? (
            <SecurePdfViewer url={`/api/files/encoded/${encodePath(file.file_path.replace(/\.[^/.]+$/, ".pdf"))}`} />
          ) : markdownContent ? (
            <div className="max-w-4xl mx-auto p-8 md:p-12">
              <ChatMarkdownViewer 
                content={markdownContent} 
                filePath={file.file_path} 
              />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center text-zinc-500">
              <FileText className="size-12 mb-4 opacity-20" />
              <p>Không tìm thấy nội dung để hiển thị</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
