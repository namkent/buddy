"use client";

import { useEffect, useState } from "react";
import { Loader2, X, FileText, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { AssistantRuntimeProvider, useLocalRuntime, TextMessagePartProvider, MessageProvider } from "@assistant-ui/react";
import remarkGfm from "remark-gfm";
import SecurePdfViewer from "./secure-pdf-viewer";

// Copy y hệt logic từ bản Admin để đảm bảo hoạt động ổn định
const ChatMarkdownViewer = ({ content, filePath }: { content: string; filePath: string }) => {
  const runtime = useLocalRuntime({
    run: async () => ({}) as any,
  });

  const mockMessage = {
    id: "viewer-msg",
    role: "assistant",
    content: [{ type: "text", text: content }],
    status: { type: "complete" },
    metadata: {},
  } as any;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MessageProvider message={mockMessage} index={0}>
        <TextMessagePartProvider text={content}>
          <div className="aui-md prose dark:prose-invert max-w-none font-sans leading-relaxed">
            <MarkdownTextPrimitive
              remarkPlugins={[remarkGfm]}
              className="prose dark:prose-invert max-w-none"
              components={{
                img: ({ src, alt, ...props }) => {
                  if (!src || typeof src !== "string") return null;
                  const fileServerUrl = process.env.NEXT_PUBLIC_FILE_SERVER_URL || "/api/files";
                  let fullSrc = src;
                  try {
                    if (src.startsWith("/group_")) {
                      fullSrc = `${fileServerUrl}/encoded/${btoa(encodeURIComponent(src))}`;
                    } else if (!src.startsWith("http") && filePath) {
                      let dir = filePath.substring(0, filePath.lastIndexOf("/"));
                      if (dir.endsWith("/origin")) dir = dir.substring(0, dir.lastIndexOf("/origin"));
                      const rawSrc = `${dir}/${src.startsWith("./") ? src.substring(2) : src}`;
                      fullSrc = `${fileServerUrl}/encoded/${btoa(encodeURIComponent(rawSrc))}`;
                    }
                  } catch (e) {
                    // Fallback in case of encoding error
                    if (src.startsWith("/group_")) {
                      fullSrc = `${fileServerUrl}${src}`;
                    }
                  }
                  return <img src={fullSrc} alt={alt ?? "image"} className="my-4 max-w-full rounded-xl border shadow-sm" {...props} />;
                },
                a: ({ href, children, ...props }) => {
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
              }}
            />
          </div>
        </TextMessagePartProvider>
      </MessageProvider>
    </AssistantRuntimeProvider>
  );
};

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

  useEffect(() => {
    if (isOpen && file) {
      const ext = file.file_name.split('.').pop()?.toLowerCase();
      setIsPdf(ext === "pdf");
      loadContent();
    } else {
      setMarkdownContent(null);
      setLoading(true);
    }
  }, [isOpen, file]);

  const encodePath = (p: string) => {
    try {
      return btoa(encodeURIComponent(p));
    } catch {
      return "";
    }
  };

  const loadContent = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const basePath = file.file_path.replace(/\.[^/.]+$/, "");
      const pdfUrl = `/api/files/encoded/${encodePath(basePath + '.pdf')}`;

      // 1. Kiểm tra xem có file PDF gốc không
      const pdfCheck = await fetch(pdfUrl, { method: 'HEAD' });
      if (pdfCheck.ok) {
        setIsPdf(true);
        setMarkdownContent(null);
        setLoading(false);
        return; // Đã tìm thấy PDF, thoát luôn để ưu tiên hiển thị PDF
      }

      // 2. Nếu không có PDF, mới tìm file .md
      const mdUrl = `/api/files/encoded/${encodePath(basePath + '.md')}`;
      const mdResponse = await fetch(mdUrl);
      if (mdResponse.ok) {
        const text = await mdResponse.text();
        setMarkdownContent(text);
        setIsPdf(false);
      } else if (!isPdf) {
        // 3. Cuối cùng mới thử đọc file gốc nếu là text/html
        const res = await fetch(`/api/files/encoded/${encodePath(file.file_path)}`);
        if (res.ok) {
          const text = await res.text();
          setMarkdownContent(text);
        }
      }
    } catch (err) {
      console.warn("Failed to load content for chat viewer", err);
    } finally {
      setLoading(false);
    }
  };

  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-none w-[95vw] md:w-[80vw] lg:w-[65vw] h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-white dark:bg-zinc-900 border-none dark:border dark:border-white/5 shadow-lg rounded-lg"
      >
        <DialogHeader className="px-6 py-4 border-b dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-800/30 shrink-0 flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1 overflow-hidden">
            <DialogTitle className="text-lg font-bold truncate text-zinc-900 dark:text-zinc-100">
              {file.file_name.replace(/\.[^/.]+$/, "")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Chi tiết tài liệu trích dẫn
            </DialogDescription>
            {file.created_at && (
              <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">
                Ngày tạo: {new Date(file.created_at).toLocaleDateString('vi-VN')}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-all"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-zinc-50/30 dark:bg-zinc-800/10">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <Loader2 className="size-8 animate-spin text-indigo-500/50" />
              <p className="text-xs text-zinc-400">Đang tải nội dung...</p>
            </div>
          ) : isPdf && !markdownContent ? (
            <SecurePdfViewer
              url={`/api/files/encoded/${encodePath(file.file_path.replace(/\.[^/.]+$/, ".pdf"))}`}
              initialPage={file.page ? parseInt(String(file.page).split(',')[0].trim()) : 1}
            />
          ) : markdownContent ? (
            <div className="max-w-4xl mx-auto p-8 md:p-12">
              <ChatMarkdownViewer content={markdownContent} filePath={file.file_path} />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center">
              <FileText className="size-12 text-zinc-200 mb-4" />
              <p className="text-zinc-500">Không thể hiển thị nội dung trực tiếp.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
