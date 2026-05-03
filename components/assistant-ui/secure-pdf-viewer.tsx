import React, { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjs from "pdfjs-dist";
import {
  Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  ShieldAlert, LayoutPanelLeft, X, Search, ChevronUp, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Thiết lập worker nội bộ (không dùng CDN để hỗ trợ môi trường offline)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface SecurePdfViewerProps {
  url: string;
  initialPage?: number;
  watermarkText?: string;
}

// Component phụ để render từng Thumbnail
const Thumbnail = ({
  pdf,
  pageNo,
  isActive,
  onClick
}: {
  pdf: pdfjs.PDFDocumentProxy;
  pageNo: number;
  isActive: boolean;
  onClick: (no: number) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  useEffect(() => {
    const renderThumb = async () => {
      try {
        const page = await pdf.getPage(pageNo);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const context = canvas.getContext("2d");
        if (!context) return;

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch (e) { }
        }

        const renderTask = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;

        try {
          await renderTask.promise;
        } catch (err: any) {
          if (err.name === 'RenderingCancelledException') return;
          throw err;
        }
      } catch (err) {
        // Ignore errors from cancelled rendering or strict mode unmounts
      }
    };
    renderThumb();

    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) { }
      }
    };
  }, [pdf, pageNo]);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 p-2 cursor-pointer transition-all rounded-md group",
        isActive ? "bg-indigo-50 dark:bg-indigo-500/20 ring-2 ring-indigo-500" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
      )}
      onClick={() => onClick(pageNo)}
    >
      <div className="relative shadow-sm border bg-white dark:border-white/5 overflow-hidden">
        <canvas ref={canvasRef} className="block w-full h-auto grayscale-[0.3] group-hover:grayscale-0 transition-all" />
      </div>
      <span className={cn("text-sm font-medium", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-500")}>
        {pageNo}
      </span>
    </div>
  );
};

// Component phụ để render Mục lục phân cấp
const OutlineItem = ({
  item,
  onClick,
  depth = 0
}: {
  item: any;
  onClick: (dest: any) => void;
  depth?: number;
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const hasItems = item.items && item.items.length > 0;

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "flex items-center gap-1 py-1.5 px-2 cursor-pointer hover:bg-zinc-100 dark:hover:bg-white/5 rounded transition-colors group",
          depth > 0 && "ml-3 border-l dark:border-white/5"
        )}
        style={{ paddingLeft: `${depth * 4 + 8}px` }}
        onClick={() => onClick(item.dest)}
      >
        {hasItems && (
          <button
            className="p-0.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
          >
            <ChevronRight className={cn("size-3 transition-transform", isOpen && "rotate-90")} />
          </button>
        )}
        {!hasItems && <div className="w-4" />}
        <span className="truncate text-sm text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
          {item.title}
        </span>
      </div>
      {hasItems && isOpen && (
        <div className="flex flex-col">
          {item.items.map((subItem: any, idx: number) => (
            <OutlineItem key={idx} item={subItem} onClick={onClick} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

// Component phụ để render từng trang Full Size (Continuous Scroll)
const PdfPage = ({
  pdf,
  pageNo,
  scale,
  searchTerm,
  watermarkText,
  onVisible,
  currentResultGlobalIndex,
  searchResults
}: {
  pdf: pdfjs.PDFDocumentProxy;
  pageNo: number;
  scale: number;
  searchTerm: string;
  watermarkText: string;
  onVisible: (no: number) => void;
  currentResultGlobalIndex: number;
  searchResults: { pageNo: number; item: any }[];
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onVisible(pageNo);
        }
      },
      { threshold: 0.5 }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pageNo, onVisible]);

  useEffect(() => {
    const render = async () => {
      try {
        const page = await pdf.getPage(pageNo);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const context = canvas.getContext("2d");
        if (!context) return;

        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch (e) { }
        }

        const renderTask = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;

        await renderTask.promise;

        // Vẽ Highlight tìm kiếm (Độ chính xác cao)
        if (searchTerm && searchTerm.length >= 2) {
          const textContent = await page.getTextContent();
          context.save();
          
          // Tính toán index bắt đầu của trang này trong kết quả tìm kiếm tổng thể
          let currentGlobalMatchIdx = searchResults.findIndex(r => r.pageNo === pageNo);
          
          textContent.items.forEach((item: any) => {
            const str = item.str || "";
            const searchLower = searchTerm.toLowerCase();
            const strLower = str.toLowerCase();
            
            if (str && strLower.includes(searchLower)) {
              const [fontHeight, xRotation, yRotation, fontWidth, x, y] = item.transform;
              
              // Tìm tất cả các lần xuất hiện của từ khóa trong item này
              let startIndex = strLower.indexOf(searchLower);
              while (startIndex !== -1) {
                // Xác định màu sắc (Cam cho kết quả hiện tại, Vàng cho các kết quả khác)
                const isActive = currentGlobalMatchIdx === currentResultGlobalIndex;
                context.fillStyle = isActive ? "rgba(255, 165, 0, 0.6)" : "rgba(255, 255, 0, 0.4)";

                const totalWidth = item.width * scale;
                const startRatio = startIndex / str.length;
                const widthRatio = searchTerm.length / str.length;
                
                const [canvasX, canvasY] = viewport.convertToViewportPoint(x, y);
                const highlightX = canvasX + (totalWidth * startRatio);
                const highlightWidth = totalWidth * widthRatio;
                
                const paddingY = 2 * scale;
                context.fillRect(
                  highlightX - (1 * scale),
                  canvasY - (item.height * scale) - paddingY/2,
                  highlightWidth + (2 * scale),
                  (item.height * scale) + paddingY
                );

                startIndex = strLower.indexOf(searchLower, startIndex + 1);
                currentGlobalMatchIdx++;
              }
            }
          });
          context.restore();
        }

        // Vẽ Watermark
        drawWatermark(context, canvas.width, canvas.height, watermarkText);
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') console.error(err);
      }
    };

    render();
    return () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (e) { }
      }
    };
  }, [pdf, pageNo, scale, searchTerm, watermarkText, currentResultGlobalIndex, searchResults]);

  const drawWatermark = (ctx: CanvasRenderingContext2D, width: number, height: number, text: string) => {
    ctx.save();
    ctx.font = "bold 20px Arial";
    ctx.fillStyle = "rgba(150, 150, 150, 0.12)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const stepX = 350;
    const stepY = 100;
    for (let x = 0; x < width + stepX; x += stepX) {
      for (let y = 0; y < height + stepY; y += stepY) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  };

  return (
    <div ref={containerRef} id={`pdf-page-${pageNo}`} className="mb-8 relative shadow-2xl shadow-black/20 border dark:border-white/10 bg-white">
      <canvas ref={canvasRef} className="max-w-full h-auto block" />
    </div>
  );
};

export default function SecurePdfViewer({
  url,
  initialPage = 1,
  watermarkText = "MES ASSISTANT - CONFIDENTIAL"
}: SecurePdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(initialPage);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"thumbs" | "outline">("thumbs");
  const [outline, setOutline] = useState<any[] | null>(null);

  // Search States
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<{ pageNo: number; item: any }[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);

  // Load PDF
  useEffect(() => {
    let isMounted = true;
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const loadingTask = pdfjs.getDocument(url);
        const pdfDoc = await loadingTask.promise;
        if (isMounted) {
          setPdf(pdfDoc);
          setNumPages(pdfDoc.numPages);

          const pdfOutline = await pdfDoc.getOutline();
          setOutline(pdfOutline);
          if (pdfOutline && pdfOutline.length > 0) setSidebarTab("outline");

          setLoading(false);

          // Nếu có trang bắt đầu, cuộn đến đó sau khi load xong
          if (initialPage > 1) {
            setTimeout(() => scrollToPage(initialPage), 500);
          }
        }
      } catch (err: any) {
        console.error("Error loading PDF via PDF.js:", err);
        if (isMounted) {
          setError("Không thể tải tài liệu bảo mật.");
          setLoading(false);
        }
      }
    };

    loadPdf();
    return () => { isMounted = false; };
  }, [url]);

  const scrollToPage = (pageNo: number) => {
    const pageElement = document.getElementById(`pdf-page-${pageNo}`);
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Hàm thực hiện tìm kiếm
  const handleSearch = async (term: string) => {
    if (!pdf || !term || term.length < 2) {
      setSearchResults([]);
      setCurrentResultIndex(-1);
      return;
    }

    setIsSearching(true);
    const results: { pageNo: number; item: any }[] = [];

    try {
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        textContent.items.forEach((item: any) => {
          const str = item.str || "";
          const strLower = str.toLowerCase();
          const searchLower = term.toLowerCase();
          
          if (str && strLower.includes(searchLower)) {
            // Tìm tất cả các lần xuất hiện trong item này để khớp với logic vẽ
            let idx = strLower.indexOf(searchLower);
            while (idx !== -1) {
              results.push({ pageNo: i, item });
              idx = strLower.indexOf(searchLower, idx + 1);
            }
          }
        });
      }
      setSearchResults(results);
      if (results.length > 0) {
        setCurrentResultIndex(0);
        scrollToPage(results[0].pageNo);
      } else {
        setCurrentResultIndex(-1);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Xử lý khi click vào mục lục
  const handleOutlineClick = async (dest: any) => {
    if (!pdf || !dest) return;
    try {
      let pageRef = dest;
      if (typeof dest === "string") {
        pageRef = await pdf.getDestination(dest);
      }
      if (Array.isArray(pageRef)) {
        const pageIndex = await pdf.getPageIndex(pageRef[0]);
        scrollToPage(pageIndex + 1);
      }
    } catch (err) {
      console.warn("Failed to navigate to outline destination", err);
    }
  };

  const nextSearchResult = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentResultIndex + 1) % searchResults.length;
    setCurrentResultIndex(nextIndex);
    scrollToPage(searchResults[nextIndex].pageNo);
  };

  const prevSearchResult = () => {
    if (searchResults.length === 0) return;
    const prevIndex = (currentResultIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentResultIndex(prevIndex);
    scrollToPage(searchResults[prevIndex].pageNo);
  };

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-zinc-50 dark:bg-zinc-900/50">
        <ShieldAlert className="size-12 text-red-500 mb-4" />
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">Lỗi bảo mật</h3>
        <p className="text-sm text-zinc-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 select-none overflow-hidden" onContextMenu={handleContextMenu}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-zinc-900 border-b dark:border-white/5 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
            className={cn("size-8 transition-colors", showSidebar && "bg-zinc-100 dark:bg-zinc-800 text-indigo-500")}
          >
            <LayoutPanelLeft className="size-4" />
          </Button>
          <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1" />

          {/* Search Bar */}
          <div className="relative flex items-center group">
            <div className="absolute left-2.5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors">
              {isSearching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            </div>
            <input
              type="text"
              placeholder="Tìm trong tài liệu..."
              className="h-8 w-48 md:w-80 pl-8 pr-16 bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch(searchTerm)}
            />
            {searchResults.length > 0 && (
              <div className="absolute right-1 flex items-center gap-0.5 bg-white dark:bg-zinc-950 rounded-md shadow-sm border dark:border-white/5 p-0.5 animate-in fade-in zoom-in duration-200">
                <span className="text-[10px] font-bold text-zinc-500 px-1 border-r dark:border-white/5">
                  {currentResultIndex + 1}/{searchResults.length}
                </span>
                <Button variant="ghost" size="icon" onClick={prevSearchResult} className="size-5 h-5">
                  <ChevronUp className="size-3" />
                </Button>
                <Button variant="ghost" size="icon" onClick={nextSearchResult} className="size-5 h-5">
                  <ChevronDown className="size-3" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => { setSearchTerm(""); setSearchResults([]); }} className="size-5 h-5 text-red-500">
                  <X className="size-3" />
                </Button>
              </div>
            )}
          </div>

          <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1" />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => scrollToPage(Math.max(1, pageNum - 1))}
              disabled={pageNum <= 1}
              className="size-8"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-400 min-w-[70px] text-center">
              {pageNum} / {numPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => scrollToPage(Math.min(numPages, pageNum + 1))}
              disabled={pageNum >= numPages}
              className="size-8"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="size-7 h-7">
              <ZoomOut className="size-3.5" />
            </Button>
            <span className="text-sm font-mono font-bold text-zinc-500 w-12 text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.min(3, s + 0.25))} className="size-7 h-7">
              <ZoomIn className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar thumbnails & outline */}
        {showSidebar && pdf && (
          <div className="w-56 border-r dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-hidden flex flex-col shrink-0 animate-in slide-in-from-left duration-200">
            {/* Tabs */}
            <div className="flex border-b dark:border-white/5 p-1 bg-white/50 dark:bg-zinc-900/50">
              <button
                className={cn("flex-1 py-2 text-sm font-bold rounded-md transition-all uppercase tracking-tight", sidebarTab === "thumbs" ? "bg-white dark:bg-zinc-800 shadow-sm text-indigo-500" : "text-zinc-400 hover:text-zinc-600")}
                onClick={() => setSidebarTab("thumbs")}
              >
                Trang
              </button>
              <button
                className={cn("flex-1 py-2 text-sm font-bold rounded-md transition-all uppercase tracking-tight", sidebarTab === "outline" ? "bg-white dark:bg-zinc-800 shadow-sm text-indigo-500" : "text-zinc-400 hover:text-zinc-600")}
                onClick={() => setSidebarTab("outline")}
                disabled={!outline || outline.length === 0}
              >
                Mục lục
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {sidebarTab === "thumbs" ? (
                <div className="flex flex-col gap-1">
                  {Array.from({ length: numPages }, (_, i) => (
                    <Thumbnail
                      key={i + 1}
                      pdf={pdf}
                      pageNo={i + 1}
                      isActive={pageNum === i + 1}
                      onClick={scrollToPage}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-0.5 text-sm">
                  {outline?.map((item, idx) => (
                    <OutlineItem key={idx} item={item} onClick={handleOutlineClick} depth={0} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main content - Continuous Scroll */}
        <div className="flex-1 overflow-auto bg-zinc-200/50 dark:bg-zinc-950/50 custom-scrollbar relative p-4 md:p-8 flex flex-col items-center">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm z-20">
              <Loader2 className="size-8 animate-spin text-indigo-500" />
              <p className="text-xs font-medium text-zinc-500 mt-3 italic">Đang mã hóa dữ liệu an toàn...</p>
            </div>
          )}

          {pdf && Array.from({ length: numPages }, (_, i) => (
            <PdfPage
              key={i + 1}
              pdf={pdf}
              pageNo={i + 1}
              scale={scale}
              searchTerm={searchTerm}
              watermarkText={watermarkText}
              onVisible={setPageNum}
              currentResultGlobalIndex={currentResultIndex}
              searchResults={searchResults}
            />
          ))}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .select-none { display: none !important; }
        }
      `}</style>
    </div>
  );
}
