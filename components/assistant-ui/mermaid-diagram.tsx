"use client";

import { useAuiState } from "@assistant-ui/react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import mermaid from "mermaid";
import { FC, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Props for the MermaidDiagram component
 */
export type MermaidDiagramProps = SyntaxHighlighterProps & {
  className?: string;
};

// Configure mermaid options here
mermaid.initialize({ theme: "default", startOnLoad: false });

/**
 * MermaidDiagram component for rendering Mermaid diagrams
 * Use it by passing to `componentsByLanguage` for mermaid in `markdown-text.tsx`
 *
 * @example
 * const MarkdownTextImpl = () => {
 *   return (
 *     <MarkdownTextPrimitive
 *       remarkPlugins={[remarkGfm]}
 *       className="aui-md"
 *       components={defaultComponents}
 *       componentsByLanguage={{
 *         mermaid: {
 *           SyntaxHighlighter: MermaidDiagram
 *         },
 *       }}
 *     />
 *   );
 * };
 */
export const MermaidDiagram: FC<MermaidDiagramProps> = ({
  code,
  className,
  node: _node,
  components: _components,
  language: _language,
}) => {
  const ref = useRef<HTMLPreElement>(null);
  const [error, setError] = useState<boolean>(false);

  // Detect when this code block is complete
  const isComplete = useAuiState((s) => {
    const isPartStreaming = s.part.status?.type === "running";
    const isDoneGenerating = !isPartStreaming;

    if (s.part.type !== "text") return isDoneGenerating;

    const fullText = s.part.text;
    const codeIndex = fullText.indexOf(code);
    
    if (codeIndex === -1) return isDoneGenerating;

    const afterCode = fullText.substring(codeIndex + code.length);
    const closingBackticksMatch = afterCode.match(/^\s*```/);
    
    return closingBackticksMatch !== null || isDoneGenerating;
  });

  useEffect(() => {
    if (!isComplete || !ref.current) return;

    const renderDiagram = async () => {
      try {
        setError(false);
        // Kiểm tra cú pháp trước khi render
        const isValid = await mermaid.parse(code, { suppressErrors: true });
        if (!isValid) return;

        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(id, code);
        
        if (ref.current) {
          ref.current.innerHTML = result.svg;
          result.bindFunctions?.(ref.current);
        }
      } catch (e) {
        console.warn("Failed to render Mermaid diagram:", e);
        setError(true);
      }
    };

    renderDiagram();
  }, [isComplete, code]);

  return (
    <pre
      ref={ref}
      className={cn(
        "aui-mermaid-diagram rounded-b-lg bg-muted p-2 text-center [&_svg]:mx-auto",
        className,
      )}
    >
      {error ? "Failed to render diagram" : "Drawing diagram..."}
    </pre>
  );
};

MermaidDiagram.displayName = "MermaidDiagram";