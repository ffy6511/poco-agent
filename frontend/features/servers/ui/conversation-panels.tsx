"use client";

import * as React from "react";
import { Bookmark, ChevronDown, Inbox, Search } from "lucide-react";

import type { FeedItem } from "@/features/servers/ui/server-workspace-types";
import { useT } from "@/lib/i18n/client";

import { getMessageAuthor, MessageRow } from "./conversation-message-row";

export function SearchPanel({
  search,
  onSearchChange,
  items,
  savedMessageIds,
  onOpenThread,
  onToggleSaved,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  items: FeedItem[];
  savedMessageIds: Set<string>;
  onOpenThread: (item: FeedItem) => void;
  onToggleSaved: (messageId: string) => void;
}) {
  const { t } = useT("translation");
  const [mineOnly, setMineOnly] = React.useState(false);
  const [todayOnly, setTodayOnly] = React.useState(false);

  const visibleItems = React.useMemo(() => {
    const now = new Date();
    return items.filter((item) => {
      if (
        mineOnly &&
        getMessageAuthor(item.message) !== item.message.authorUserId
      ) {
        return false;
      }
      if (todayOnly) {
        const createdAt = new Date(item.message.createdAt);
        return (
          createdAt.getFullYear() === now.getFullYear() &&
          createdAt.getMonth() === now.getMonth() &&
          createdAt.getDate() === now.getDate()
        );
      }
      return true;
    });
  }, [items, mineOnly, todayOnly]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-border bg-muted text-foreground">
            <Search className="size-4" />
          </div>
          <div className="flex-1 rounded-md border border-border bg-background px-3 py-2.5">
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("conversationView.searchPlaceholder")}
              className="w-full border-none bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMineOnly((value) => !value)}
            className={`rounded-md border border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-foreground transition-colors ${
              mineOnly ? "bg-primary/15" : "bg-card hover:bg-muted/20"
            }`}
          >
            {t("conversationView.myMessages")}
          </button>
          <button
            type="button"
            onClick={() => setTodayOnly((value) => !value)}
            className={`flex items-center gap-2 rounded-md border border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-foreground transition-colors ${
              todayOnly ? "bg-primary/15" : "bg-card hover:bg-muted/20"
            }`}
          >
            {todayOnly
              ? t("conversationView.today")
              : t("conversationView.anyTime")}
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        {visibleItems.length > 0 ? (
          visibleItems.map((item) => (
            <MessageRow
              key={item.message.id}
              message={item.message}
              channelLabel={item.channel.name}
              isSaved={savedMessageIds.has(item.message.id)}
              onOpenThread={() => onOpenThread(item)}
              onToggleSaved={() => onToggleSaved(item.message.id)}
            />
          ))
        ) : (
          <div className="flex h-full min-h-[20rem] items-center justify-center px-8 text-center">
            <div className="space-y-3">
              <Search className="mx-auto size-10 text-muted-foreground/40" />
              <p className="text-xl font-semibold text-foreground">
                {t("conversationView.searchEverything")}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t("conversationView.searchEverythingDescription")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FeedPanel({
  mode,
  items,
  savedMessageIds,
  onOpenThread,
  onToggleSaved,
}: {
  mode: "inbox" | "saved";
  items: FeedItem[];
  savedMessageIds: Set<string>;
  onOpenThread: (item: FeedItem) => void;
  onToggleSaved: (messageId: string) => void;
}) {
  const { t } = useT("translation");
  const isSaved = mode === "saved";
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-md border border-border bg-muted text-foreground">
            {isSaved ? (
              <Bookmark className="size-5" />
            ) : (
              <Inbox className="size-5" />
            )}
          </div>
          <div>
            <p className="text-2xl font-semibold text-foreground">
              {isSaved
                ? t("conversationView.saved")
                : t("conversationView.inbox")}
            </p>
            <p className="text-base text-muted-foreground">
              {isSaved
                ? t("conversationView.savedCount", { count: items.length })
                : t("conversationView.activeCount", { count: items.length })}
            </p>
          </div>
        </div>
      </div>
      <div className="border-b border-border px-6 py-5">
        <div className="flex gap-3">
          <div className="rounded-md border border-border bg-primary/15 px-5 py-3 text-sm font-medium text-foreground">
            {t("conversationView.all")}
          </div>
          {!isSaved ? (
            <div className="rounded-md border border-border bg-card px-5 py-3 text-sm font-medium text-foreground">
              {t("conversationView.unread")}
            </div>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        {items.length > 0 ? (
          items.map((item) => (
            <MessageRow
              key={item.message.id}
              message={item.message}
              channelLabel={item.channel.name}
              isSaved={savedMessageIds.has(item.message.id)}
              onOpenThread={() => onOpenThread(item)}
              onToggleSaved={() => onToggleSaved(item.message.id)}
            />
          ))
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <p className="text-lg text-muted-foreground">
              {isSaved
                ? t("conversationView.noSaved")
                : t("conversationView.noInbox")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
