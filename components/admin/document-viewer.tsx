"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Download, FileText, FileCode, FileArchive, Maximize2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import mammoth from "mammoth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { AssistantRuntimeProvider, useLocalRuntime, TextMessagePartProvider, MessageProvider } from "@assistant-ui/react";
import remarkGfm from "remark-gfm";

const MarkdownTextInternal = ({ content, filePath }: { content: string; filePath?: string }) => {
  const runtime = useLocalRuntime({
    run: async () => ({}) as any,
  });

  const mockMessage = {
    id: "debug-msg",
    role: "assistant",
    content: [{ type: "text", text: content }],
    status: { type: "complete" },
    metadata: {},
  } as any;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MessageProvider message={mockMessage} index={0}>
        <TextMessagePartProvider text={content}>
          <div className="aui-md">
            <MarkdownTextPrimitive
              remarkPlugins={[remarkGfm]}
              className="prose dark:prose-invert max-w-none"
              components={{
                img: ({ src, alt, ...props }) => {
                  if (!src || typeof src !== "string") return null;

                  let fullSrc = src;
                  const fileServerUrl = process.env.NEXT_PUBLIC_FILE_SERVER_URL || "";

                  if (src.startsWith("/group_")) {
                    // Đường dẫn tuyệt đối trong hệ thống RAG
                    fullSrc = `${fileServerUrl}${src}`;
                  } else if (!src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("//") && filePath) {
                    // Đường dẫn tương đối - Resolve dựa trên thư mục của file hiện tại
                    try {
                      // Nếu file nằm trong thư mục /origin/, trích xuất ảnh từ thư mục cha (sibling of origin)
                      let dir = filePath.substring(0, filePath.lastIndexOf("/"));
                      if (dir.endsWith("/origin")) {
                        dir = dir.substring(0, dir.lastIndexOf("/origin"));
                      }

                      const cleanSrc = src.startsWith("./") ? src.substring(2) : src;
                      fullSrc = `${fileServerUrl}${dir}/${cleanSrc}`;
                    } catch (e) {
                      console.warn("[Viewer] Failed to resolve relative image path:", src);
                    }
                  }

                  return (
                    <img
                      src={fullSrc}
                      alt={alt ?? "image"}
                      className="aui-md-img my-2.5 max-w-full rounded-lg shadow-sm border"
                      {...props}
                    />
                  );
                }
              }}
            />
          </div>
        </TextMessagePartProvider>
      </MessageProvider>
    </AssistantRuntimeProvider>
  );
};

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    id: number;
    file_name: string;
    file_path: string;
    page?: string | number | null;
  } | null;
}

export default function DocumentViewer({ isOpen, onClose, file }: DocumentViewerProps) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string | null>(null);
  const [type, setType] = useState<"html" | "pdf" | "docx" | "txt" | "unknown">("unknown");
  const [error, setError] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("original");

  useEffect(() => {
    if (isOpen && file) {
      loadDocument();
      loadMarkdown();
    } else {
      setContent(null);
      setMarkdownContent(null);
      setError(null);
      setLoading(true);
      setActiveTab("original");
    }
  }, [isOpen, file]);

  const loadDocument = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const ext = file.file_name.split('.').pop()?.toLowerCase();
    const url = `/api/files${file.file_path}`;

    try {
      if (ext === "pdf" || ext === "html" || ext === "htm") {
        setType(ext === "pdf" ? "pdf" : "html");
        setLoading(false);
      } else if (ext === "docx") {
        setType("docx");
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setContent(result.value);
        setLoading(false);
      } else if (ext === "txt") {
        setType("txt");
        const response = await fetch(url);
        const text = await response.text();
        setContent(text);
        setLoading(false);
      } else {
        setType("unknown");
        setLoading(false);
      }
    } catch (err) {
      console.error("Error loading document:", err);
      setError("Failed to load document content. Please try downloading instead.");
      setLoading(false);
    }
  };

  const loadMarkdown = async () => {
    if (!file) return;
    try {
      const mdUrl = `/api/files${file.file_path.replace(/\.[^/.]+$/, ".md")}`;
      const response = await fetch(mdUrl);
      if (response.ok) {
        const text = await response.text();
        setMarkdownContent(text);
      }
    } catch (err) {
      console.warn("Markdown debug file not found or load fail");
    }
  };

  const handleIframeLoad = (e: any) => {
    try {
      const iframe = e.target;
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (doc && doc.head) {
        const style = doc.createElement("style");
        style.innerHTML = `
          @font-face {
            font-family: 'Google Sans';
            src: url('/fonts/GoogleSans.ttf') format('truetype');
            font-weight: normal;
            font-style: normal;
          }
          body { 
            font-family: 'Google Sans', ui-sans-serif, system-ui, -apple-system, sans-serif !important;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          img {
            max-width: 100% !important;
            height: auto !important;
          }
        `;
        doc.head.appendChild(style);
      }
    } catch (err) {
      // Bỏ qua lỗi cross-origin
    }
  };

  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-none w-[95vw] md:w-[85vw] lg:w-[75vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-white dark:bg-zinc-950 border-zinc-200 dark:border-white/10 shadow-2xl"
      >
        <DialogHeader className="p-4 border-b bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                {type === "pdf" ? <FileArchive className="size-5 text-red-500" /> :
                  type === "docx" ? <FileText className="size-5 text-blue-500" /> :
                    <FileCode className="size-5 text-indigo-500" />}
              </div>
              <div>
                <DialogTitle className="text-base font-bold truncate max-w-[400px] md:max-w-[800px]">
                  {file.file_name}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Document viewer for {file.file_name}
                </DialogDescription>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                    {file.file_name.split('.').pop()}
                  </span>
                  <span className="text-[10px] text-zinc-400">ID: {file.id}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pr-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-4 gap-2 border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                onClick={() => window.open(`/api/files${file.file_path}`, "_blank")}
              >
                <ExternalLink className="size-4" />
                <span className="hidden sm:inline">Open Original</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-9 px-4 gap-2 border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = `/api/files${file.file_path}`;
                  a.download = file.file_name;
                  a.click();
                }}
              >
                <Download className="size-4" />
                <span className="hidden sm:inline">Download</span>
              </Button>

              <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-3" />

              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-full hover:bg-red-50 dark:hover:bg-red-500/10 text-zinc-400 hover:text-red-500 transition-all active:scale-95"
                onClick={onClose}
              >
                <X className="size-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-zinc-100/30 dark:bg-zinc-900/10 relative">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-sm z-50">
              <Loader2 className="size-8 animate-spin text-indigo-500" />
              <p className="text-sm text-zinc-500 animate-pulse">Preparing document viewer...</p>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center">
              <div className="size-16 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-4">
                <X className="size-8 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Unable to load document</h3>
              <p className="text-zinc-500 max-w-md mx-auto mb-6">{error}</p>
              <Button onClick={() => window.open(`/api/files${file.file_path}`, "_blank")} className="bg-red-500 hover:bg-red-600">
                Open in Browser instead
              </Button>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b px-4 py-1 flex justify-center shrink-0">
                <TabsList className="bg-zinc-200/50 dark:bg-zinc-800/50 h-8">
                  <TabsTrigger value="original" className="text-[11px] h-6 px-4">Original View</TabsTrigger>
                  <TabsTrigger value="markdown" className="text-[11px] h-6 px-4" disabled={!markdownContent}>
                    Markdown Result {!markdownContent && "(Not Processed)"}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 min-h-0">
                <TabsContent value="original" className="h-full m-0 p-0 overflow-hidden">
                  <div className="h-full w-full bg-zinc-100/50 dark:bg-zinc-900/20 overflow-auto custom-scrollbar">
                    {(type === "pdf" || type === "html") ? (
                      <div className={cn(
                        "h-full w-full mx-auto transition-all duration-300",
                        type === "html" && "max-w-4xl bg-white dark:bg-zinc-950 shadow-lg border-x min-h-full"
                      )}>
                        <iframe
                          src={`/api/files${file.file_path}${file.page ? `#page=${file.page}` : "#toolbar=0"}`}
                          className="w-full h-full border-none"
                          title={file.file_name}
                          onLoad={handleIframeLoad}
                        />
                      </div>
                    ) : type === "docx" ? (
                      <div className="h-full overflow-auto bg-white dark:bg-zinc-950 p-8 md:p-12 font-sans">
                        <div
                          className="prose prose-sm md:prose-base dark:prose-invert max-w-4xl mx-auto shadow-sm p-4 md:p-8 border rounded-lg bg-white dark:bg-zinc-900/50"
                          dangerouslySetInnerHTML={{ __html: content || "" }}
                        />
                      </div>
                    ) : type === "txt" ? (
                      <div className="h-full overflow-auto p-4 md:p-8 bg-zinc-50 dark:bg-zinc-900/30">
                        <pre className="text-xs md:text-sm font-mono text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 p-6 rounded-lg border shadow-sm h-full overflow-auto">
                          {content}
                        </pre>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                        <div className="size-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                          <Maximize2 className="size-8 text-zinc-400" />
                        </div>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Format not supported for direct view</h3>
                        <p className="text-zinc-500 max-w-md mx-auto mb-6">
                          This file format cannot be rendered directly in the modal. Please download it to view on your device.
                        </p>
                        <Button
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = `/api/files${file.file_path}`;
                            a.download = file.file_name;
                            a.click();
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 shadow-lg"
                        >
                          <Download className="size-3.5 mr-2" />
                          Download to View
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="markdown" className="h-full m-0 p-0 overflow-auto bg-white dark:bg-zinc-950 font-sans">
                  <div className="max-w-4xl mx-auto p-8 md:p-12">
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg text-base text-amber-700 dark:text-amber-400 font-sans">
                      Đây là kết quả sau khi hệ thống xử lý nội dung sang Markdown để phục vụ bộ nhớ RAG.
                    </div>
                    <div className="prose prose-sm md:prose-base dark:prose-invert font-sans">
                      {markdownContent ? (
                        <MarkdownTextInternal
                          content={markdownContent}
                          filePath={file.file_path}
                        />
                      ) : (
                        <p className="text-zinc-500 italic">No markdown version available.</p>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
