"use client";

import { useAuiState } from "@assistant-ui/react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import mermaid from "mermaid";
import { toPng } from "html-to-image";
import { useTheme } from "next-themes";
import { FC, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Copy, Download, Maximize2, X, CheckIcon } from "lucide-react";

export type MermaidDiagramProps = SyntaxHighlighterProps & {
  className?: string;
};

// Default initialization
mermaid.initialize({
  startOnLoad: false,
  themeVariables: {
    fontFamily: "'GoogleSans', 'Roboto', sans-serif",
    fontSize: "14px",
  },
});


// ─── Toolbar button ───────────────────────────────────────────────────────────
const ToolButton: FC<{
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}> = ({ onClick, title, children, active }) => (
  <button
    onClick={onClick}
    title={title}
    className={cn(
      "p-1.5 rounded-md transition-colors text-muted-foreground",
      "hover:bg-accent hover:text-accent-foreground",
      active && "text-green-500"
    )}
  >
    {children}
  </button>
);

// ─── Modal ─────────────────────────────────────────────────────────────────────
const DiagramModal: FC<{ svgHtml: string; onClose: () => void }> = ({ svgHtml, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const zoomContainerRef = useRef<HTMLDivElement>(null);

  // Xử lý zoom bằng con lăn chuột
  useEffect(() => {
    const el = zoomContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale(prev => Math.min(Math.max(prev - e.deltaY * 0.001, 0.5), 10));
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Xử lý phím Escape và khóa cuộn trang
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "auto";
    };
  }, [onClose]);

  // Logic bắt đầu kéo
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  // Logic đang kéo
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  // Logic dừng kéo
  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md overscroll-none p-4 md:p-8"
      onClick={onClose}
    >
      <div
        className="relative bg-background rounded-lg shadow-2xl border border-border w-full h-full max-w-7xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground uppercase tracking-wider">Preview Diagram</span>
            <span className="text-xs text-muted-foreground ml-2 px-1.5 py-0.5 bg-accent rounded">
              {Math.round(scale * 100)}%
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all duration-200"
            title="Đóng (Esc)"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Cửa sổ hiển thị biểu đồ */}
        <div
          ref={zoomContainerRef}
          className={cn(
            "flex-1 overflow-hidden relative select-none bg-dot-pattern bg-[length:24px_24px]",
            isDragging ? "cursor-grabbing" : "cursor-grab"
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.1s ease-out"
            }}
            dangerouslySetInnerHTML={{
              __html: `<style>svg { width: auto !important; height: auto !important; max-width: 95% !important; max-height: 95% !important; outline: none; }</style>` + svgHtml
            }}
          />
        </div>

        {/* Footer hướng dẫn */}
        <div className="px-4 py-2 border-t border-border bg-muted/20 shrink-0">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[11px] font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="px-1 py-0.5 bg-accent border border-border rounded shadow-sm text-foreground">Cuộn chuột</span> Zoom in/out
            </span>
            <span className="flex items-center gap-1.5">
              <span className="px-1 py-0.5 bg-accent border border-border rounded shadow-sm text-foreground">Giữ chuột</span> Kéo để di chuyển
            </span>
            <span className="flex items-center gap-1.5">
              <span className="px-1 py-0.5 bg-accent border border-border rounded shadow-sm text-foreground">Esc</span> Thoát
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
export const MermaidDiagram: FC<MermaidDiagramProps> = ({
  code,
  className,
  node: _node,
  components: _components,
  language: _language,
}) => {
  const { resolvedTheme } = useTheme();
  const displayRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const isTall = dimensions.height > dimensions.width;

  const isComplete = useAuiState((s) => {
    const isRunning = s.part.status?.type === "running";
    if (s.part.type !== "text") return !isRunning;

    // Kiểm tra xem Mermaid code block đã kết thúc chưa (có dấu đóng ```)
    const fullText = s.part.text;
    const codeIndex = fullText.indexOf(code);
    if (codeIndex === -1) return !isRunning;

    const afterCode = fullText.substring(codeIndex + code.length);
    return afterCode.includes("```") || !isRunning;
  });

  useEffect(() => {
    if (!isComplete) return;
    let cancelled = false;

    const render = async () => {
      try {
        setError(false);

        // Re-initialize mermaid with the current theme
        const isDark = resolvedTheme === "dark";
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          themeVariables: {
            fontFamily: "'GoogleSans', 'Roboto', sans-serif",
            fontSize: "14px",
            textColor: isDark ? "#f8fafc" : "#0f172a",
          },
          flowchart: { useMaxWidth: false, htmlLabels: true },
          sequence: { useMaxWidth: false },
          state: { useMaxWidth: false },
          er: { useMaxWidth: false },
          journey: { useMaxWidth: false },
          gantt: { useMaxWidth: false },
        });

        const valid = await mermaid.parse(code, { suppressErrors: true });
        if (!valid) return;
        if (cancelled) return;

        const id = `m-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, code);
        if (cancelled) return;

        // Use viewBox for accurate aspect ratio detection
        const viewBoxMatch = svg.match(/viewBox=["'](?:[\d.]+\s+){2}([\d.]+)\s+([\d.]+)["']/);
        if (viewBoxMatch) {
          const w = parseFloat(viewBoxMatch[1]);
          const h = parseFloat(viewBoxMatch[2]);
          setDimensions({ width: w, height: h });
        } else {
          // Fallback to width/height attributes
          const wMatch = svg.match(/width=["']([\d.]+)(?:px)?["']/);
          const hMatch = svg.match(/height=["']([\d.]+)(?:px)?["']/);
          setDimensions({
            width: wMatch ? parseFloat(wMatch[1]) : 0,
            height: hMatch ? parseFloat(hMatch[1]) : 0,
          });
        }

        // Aggressively clean up SVG for auto-fitting while preserving aspect ratio
        const styled = svg
          .replace(/<svg\s+([^>]*)>/i, (match, attributes) => {
            // Remove existing width, height, and style to let CSS take over
            const cleanAttributes = attributes
              .replace(/(?:width|height|style)\s*=\s*["'][^"']*["']/ig, "")
              .trim();

            // Ensure preserveAspectRatio is present for correct scaling
            const hasPreserve = /preserveAspectRatio\s*=/i.test(cleanAttributes);
            const extra = hasPreserve ? "" : ' preserveAspectRatio="xMidYMid meet"';

            // If tall, we want to make sure it doesn't scale up too much
            const style = isTall
              ? "font-family:'GoogleSans',Roboto,sans-serif; width: auto; height: auto; max-width: 100%; max-height: 100%; display: block; margin: auto;"
              : "font-family:'GoogleSans',Roboto,sans-serif; width: 100%; height: auto; max-width: 100%; max-height: 100%; display: block; margin: auto;";

            return `<svg ${cleanAttributes}${extra} style="${style}">`;
          });


        setSvgHtml(styled);


      } catch (e) {
        if (!cancelled) {
          console.warn("Mermaid render failed:", e);
          setError(true);
        }
      }
    };

    render();
    return () => { cancelled = true; };
  }, [isComplete, code, resolvedTheme]);

  const handleCopy = async () => {
    if (!displayRef.current) return;
    try {
      const dataUrl = await toPng(displayRef.current, { backgroundColor: "transparent" });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn("Copy failed:", e);
    }
  };

  const handleDownload = async () => {
    if (!displayRef.current) return;
    try {
      const dataUrl = await toPng(displayRef.current, { backgroundColor: "transparent" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "diagram.png";
      a.click();
    } catch (e) {
      console.warn("Download failed:", e);
    }
  };

  return (
    <>
      <div className={cn("aui-mermaid-diagram-wrapper group relative rounded-b-lg bg-muted overflow-hidden [container-type:inline-size]", className)}>
        {/* Hover toolbar */}
        {svgHtml && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm border border-border rounded-lg p-0.5 shadow-md">
            <ToolButton onClick={handleCopy} title="Copy as PNG" active={copied}>
              {copied ? <CheckIcon className="size-3.5" /> : <Copy className="size-3.5" />}
            </ToolButton>
            <ToolButton onClick={handleDownload} title="Download PNG">
              <Download className="size-3.5" />
            </ToolButton>
            <ToolButton onClick={() => setModalOpen(true)} title="Maximize">
              <Maximize2 className="size-3" />
            </ToolButton>
          </div>
        )}

        {/* SVG display — React never reconciles children here */}
        {svgHtml ? (
          <div
            ref={displayRef}
            className={cn(
              "py-4 px-6 w-full flex items-center justify-center transition-all duration-300 overflow-hidden",
              isTall ? "aspect-square" : "h-auto min-h-[120px]",
              "max-h-[80vh]"
            )}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />

        ) : (
          <div className="p-4 text-center text-muted-foreground text-sm">
            {error ? "Failed to render diagram" : "Drawing diagram..."}
          </div>
        )}
      </div>

      {modalOpen && svgHtml && (
        <DiagramModal svgHtml={svgHtml} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
};

MermaidDiagram.displayName = "MermaidDiagram";