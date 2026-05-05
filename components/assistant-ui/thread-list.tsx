"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AuiIf,
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { ArchiveIcon, MoreHorizontalIcon, PlusIcon, TrashIcon, ChevronDownIcon, MessageSquareIcon } from "lucide-react";
import { type FC, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-context";

export const ThreadList: FC = () => {
  const [isArchivedOpen, setIsArchivedOpen] = useState(false);

  return (
    <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col gap-1 flex-1 overflow-hidden">
      <ThreadListNew />
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 pl-1 pr-0">
        <AuiIf condition={({ threads }) => threads.isLoading}>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <ThreadListSkeleton />
          </div>
        </AuiIf>

        <AuiIf condition={({ threads }) => !threads.isLoading}>
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Khu vực tin nhắn Active - chiếm tối đa diện tích còn lại */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="flex flex-col gap-1">
                <ThreadListPrimitive.Items>
                  {() => <ThreadListItem />}
                </ThreadListPrimitive.Items>
              </div>
            </div>

            {/* Khu vực tin nhắn Archived - cố định ở đáy */}
            <ArchivedSection isArchivedOpen={isArchivedOpen} setIsArchivedOpen={setIsArchivedOpen} />
          </div>
        </AuiIf>
      </div>
    </ThreadListPrimitive.Root>
  );
};

// ─── ThreadListNew ────────────────────────────────────────────────────────────
const ThreadListNew: FC = () => {
  const { t } = useI18n();
  const handleClick = () => {
    // Thread mới chưa có remoteId → URL về /
    window.history.pushState({}, "", "/");
  };

  return (
    <ThreadListPrimitive.New asChild>
      <Button
        variant="outline"
        className="aui-thread-list-new h-9 justify-start gap-2 rounded-lg px-3 text-sm hover:bg-muted data-active:bg-muted mr-2"
        onClick={handleClick}
      >
        <PlusIcon className="size-4" />
        {t('menu', 'new_thread', 'New Thread')}
      </Button>
    </ThreadListPrimitive.New>
  );
};

// ─── ThreadListSkeleton ───────────────────────────────────────────────────────
const ThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          className="aui-thread-list-skeleton-wrapper flex h-9 items-center px-3"
        >
          <Skeleton className="aui-thread-list-skeleton h-4 w-full" />
        </div>
      ))}
    </div>
  );
};

// ─── ThreadListItem ───────────────────────────────────────────────────────────
const ThreadListItem: FC<{ mode?: "active" | "archived" }> = () => {
  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item shrink-0 group/item flex h-9 items-center gap-2 rounded-lg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none data-active:bg-muted">
      <ThreadListItemTrigger />
      <ThreadListItemMore />
    </ThreadListItemPrimitive.Root>
  );
};

// Tách trigger riêng để dùng useThreadListItemRuntime trong đúng context
const ThreadListItemTrigger: FC = () => {
  const itemRuntime = useAui().threadListItem();
  const { t } = useI18n();

  const handleClick = () => {
    // Lấy externalId/remoteId của thread list item này (chạy trong context của từng item)
    const state = itemRuntime.getState();
    const threadId = state.externalId ?? state.remoteId;

    if (threadId && !threadId.startsWith("__LOCALID_")) {
      window.history.pushState({}, "", `/app/${threadId}`);
    } else {
      // thread chưa persisted (local) → về /
      window.history.pushState({}, "", "/");
    }
  };

  return (
    <ThreadListItemPrimitive.Trigger
      className="aui-thread-list-item-trigger flex h-full min-w-0 flex-1 items-center truncate px-3 text-start text-sm"
      onClick={handleClick}
    >
      <ThreadListItemPrimitive.Title fallback={t('label', 'new_chat', 'New Chat')} />
    </ThreadListItemPrimitive.Trigger>
  );
};

// ─── ThreadListItemMore ───────────────────────────────────────────────────────
const ThreadListItemMore: FC = () => {
  const status = useAuiState((s) => s.threadListItem.status);
  const activeThreadId = useAuiState((s) => s.threads.mainThreadId);
  const aui = useAui();
  const itemRuntime = aui.threadListItem();
  const { t } = useI18n();
  return (
    <ThreadListItemMorePrimitive.Root>
      <ThreadListItemMorePrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="aui-thread-list-item-more mr-2 size-7 p-0 opacity-0 invisible transition-all group-hover/item:opacity-100 group-hover/item:visible data-[state=open]:bg-accent data-[state=open]:opacity-100 data-[state=open]:visible"
        >
          <MoreHorizontalIcon className="size-4" />
          <span className="sr-only">More options</span>
        </Button>
      </ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        side="bottom"
        align="start"
        className="aui-thread-list-item-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <ThreadListItemPrimitive.Archive asChild>
          <ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
            <ArchiveIcon className="size-4" />
            {status === "archived" ? t('label', 'unarchive', 'Unarchive') : t('label', 'archive', 'Archive')}
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Archive>
        <ThreadListItemPrimitive.Delete asChild>
          <ThreadListItemMorePrimitive.Item 
            onSelect={() => {
              const itemState = itemRuntime.getState();
              const threadId = itemState.externalId ?? itemState.remoteId;
              if (threadId === activeThreadId) {
                window.history.pushState({}, "", "/");
                try {
                  aui.threads().switchToNewThread();
                } catch {}
              }
            }}
            className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-destructive text-sm outline-none hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive">
            <TrashIcon className="size-4" />
            {t('label', 'delete', 'Delete')}
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Delete>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
};

// ─── ArchivedSection ─────────────────────────────────────────────────────────
const ArchivedSection: FC<{ isArchivedOpen: boolean, setIsArchivedOpen: (v: boolean) => void }> = ({ isArchivedOpen, setIsArchivedOpen }) => {
  const archivedCount = useAuiState((s) => s.threads.archivedThreadIds.length);
  const { t } = useI18n();

  if (archivedCount === 0) return null;

  return (
    <div className="flex-none flex flex-col border-t border-zinc-200/50 -ml-1">
      <button
        onClick={() => setIsArchivedOpen(!isArchivedOpen)}
        className="flex h-10 w-full items-center justify-between px-3 text-[12px] font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors group select-none"
      >
        <div className="flex items-center gap-2">
          <ArchiveIcon className="size-3" />
          {t('label', 'archived', 'Archived')} ({archivedCount})
        </div>
        <ChevronDownIcon className={cn("size-3 transition-transform duration-500", isArchivedOpen ? "" : "-rotate-180")} />
      </button>

      {isArchivedOpen && (
        <div className="max-h-[16rem] overflow-y-auto custom-scrollbar border-t animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex flex-col gap-1 p-1">
            <ThreadListPrimitive.Items archived>
              {() => <ThreadListItem />}
            </ThreadListPrimitive.Items>
          </div>
        </div>
      )}
    </div>
  );
};
