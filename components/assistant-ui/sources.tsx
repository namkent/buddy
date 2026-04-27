"use client";

import { memo, useState, type ComponentProps, type ReactNode } from "react";
import type { SourceMessagePartComponent } from "@assistant-ui/react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { Globe, FileText } from "lucide-react";
import { cn } from "@/lib/utils";


const extractDomain = (url: string): string => {
  try {
    if (url.startsWith("cite:")) return "Internal Document";
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const getDomainInitial = (url: string): string => {
  const domain = extractDomain(url);
  return domain.charAt(0).toUpperCase();
};

const sourceVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        outline: "border-border text-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "border-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        muted: "border-transparent bg-muted text-muted-foreground hover:bg-muted/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        info: "border-transparent bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400",
        warning: "border-transparent bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400",
        success: "border-transparent bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px] gap-1",
        default: "px-2.5 py-0.5 text-xs gap-1.5",
        lg: "px-3 py-1 text-sm gap-2",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  }
);

interface SourceProps
  extends ComponentProps<"a">,
    VariantProps<typeof sourceVariants> {
  asChild?: boolean;
}

function Source({
  className,
  variant,
  size,
  asChild = false,
  target = "_blank",
  rel = "noopener noreferrer",
  href,
  onClick,
  ...props
}: SourceProps) {
  const Comp = asChild ? Slot : "a";
  
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    
    if (href?.startsWith("cite:")) {
      e.preventDefault();
      try {
        const params = new URLSearchParams(href.substring(5));
        const fileData = {
          id: parseInt(params.get("id") || "0"),
          file_path: params.get("path"),
          file_name: params.get("name"),
          page: params.get("page")
        };
        window.dispatchEvent(new CustomEvent("open-document", { detail: fileData }));
      } catch (err) {
        console.error("Failed to parse citation link in Source:", err);
      }
    }
  };

  return (
    <Comp
      data-slot="source"
      className={cn(sourceVariants({ variant, size }), "cursor-pointer", className)}
      target={target}
      rel={rel}
      href={href}
      onClick={handleClick as any}
      {...props}
    />
  );
}


function SourceIcon({
  url,
  className,
  ...props
}: ComponentProps<"span"> & { url: string }) {
  return (
    <span
      data-slot="source-icon"
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground",
        className
      )}
      {...props}
    >
      <FileText className="size-2.5" />
    </span>
  );
}


function SourceTitle({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="source-title"
      className={cn("max-w-[12rem] truncate md:max-w-[20rem]", className)}
      {...props}
    />
  );
}

const SourcesImpl: SourceMessagePartComponent = ({
  url,
  title,
  sourceType,
}) => {
  if (sourceType !== "url" || !url) return null;

  const domain = extractDomain(url);
  const displayTitle = title || domain;

  return (
    <Source href={url}>
      <SourceIcon url={url} />
      <SourceTitle>{displayTitle}</SourceTitle>
    </Source>
  );
};

const Sources = memo(SourcesImpl) as unknown as SourceMessagePartComponent & {
  Root: typeof Source;
  Icon: typeof SourceIcon;
  Title: typeof SourceTitle;
};

Sources.displayName = "Sources";
Sources.Root = Source;
Sources.Icon = SourceIcon;
Sources.Title = SourceTitle;

export {
  Sources,
  Source,
  SourceIcon,
  SourceTitle,
  sourceVariants,
};
