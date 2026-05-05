"use client";

import * as React from "react";
import { Bookmark, MessageSquare } from "lucide-react";

import type { ServerConversationMessage } from "@/features/servers/model/types";
import { useT } from "@/lib/i18n/client";

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays <= 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date,
  );
}

export function getInitials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function getMessageText(message: ServerConversationMessage): string {
  if (message.textPreview?.trim()) {
    return message.textPreview.trim();
  }
  const text = message.content.text;
  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }
  const title = message.content.title;
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }
  return "";
}

export function getMessageAuthor(message: ServerConversationMessage): string {
  if (message.messageType === "system") {
    const actor = message.content.actor_label;
    if (typeof actor === "string" && actor.trim()) {
      return actor.trim();
    }
    return "System";
  }
  if (message.messageType === "task") {
    const creator = message.content.creator_user_id;
    if (typeof creator === "string" && creator.trim()) {
      return creator.trim();
    }
    return "Task";
  }
  return message.authorUserId?.trim() || "User";
}

function renderMentions(text: string) {
  const tokens = text.split(/(@[A-Za-z0-9._-]+)/g);
  return tokens.map((token, index) => {
    if (token.startsWith("@")) {
      return (
        <span
          key={`${token}-${index}`}
          className="cursor-text select-text rounded-md border border-border bg-primary/10 px-1.5 py-0.5 text-sm font-semibold text-foreground"
        >
          {token}
        </span>
      );
    }
    return <React.Fragment key={`${token}-${index}`}>{token}</React.Fragment>;
  });
}

export function MessageRow({
  message,
  channelLabel,
  isSaved = false,
  onOpenThread,
  onToggleSaved,
}: {
  message: ServerConversationMessage;
  channelLabel?: string;
  isSaved?: boolean;
  onOpenThread: () => void;
  onToggleSaved: () => void;
}) {
  const { t } = useT("translation");
  const author = getMessageAuthor(message);
  const text = getMessageText(message);

  return (
    <article className="group flex gap-4 border-b border-border px-6 py-5 last:border-b-0">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-sm font-semibold text-foreground">
        {getInitials(author)}
      </div>
      <div className="relative min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-3 text-sm">
          <div className="min-w-0 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-foreground">
              {author}
            </span>
            <span className="text-sm text-muted-foreground">
              {formatRelativeDate(message.createdAt)}{" "}
              {formatTime(message.createdAt)}
            </span>
            {channelLabel ? (
              <span className="text-sm text-muted-foreground">
                #{channelLabel}
              </span>
            ) : null}
          </div>
          <div className="absolute right-0 top-0 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={onOpenThread}
              aria-label={t("conversationView.reply")}
              className="inline-flex size-8 items-center justify-center gap-1 rounded-md border border-border bg-background text-xs font-medium text-foreground transition-colors hover:bg-muted/30"
            >
              <MessageSquare className="size-3.5" />
              {message.replyCount > 0 ? (
                <span className="tabular-nums">{message.replyCount}</span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={onToggleSaved}
              aria-label={
                isSaved
                  ? t("conversationView.unsave")
                  : t("conversationView.save")
              }
              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted/30"
            >
              <Bookmark
                className={isSaved ? "size-3.5 fill-current" : "size-3.5"}
              />
            </button>
          </div>
        </div>
        <div className="cursor-text select-text text-base leading-7 text-foreground">
          {renderMentions(text || t("conversationView.emptyMessage"))}
        </div>
      </div>
    </article>
  );
}
