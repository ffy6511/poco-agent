"use client";

import * as React from "react";
import { Bookmark, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getUserAvatarUrl,
  getUserDisplayName,
} from "@/features/servers/lib/server-conversation-view";
import { getServerMessageText } from "@/features/servers/lib/server-message-text";
import type { Preset } from "@/features/capabilities/presets/lib/preset-types";
import type {
  ServerAgentItem,
  ServerConversationMessage,
  ServerExecutionMessageContent,
} from "@/features/servers/model/types";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ServerMessageContent } from "./server-message-content";
import { ServerAgentAvatar } from "./server-agent-avatar";

const AGENT_MESSAGE_COLLAPSE_LINES = 8;

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
  return getServerMessageText(message);
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
  return getUserDisplayName(message.authorUser, message.authorUserId);
}

export function isExecutionMessage(
  message: ServerConversationMessage,
): message is ServerConversationMessage & {
  content: ServerExecutionMessageContent;
} {
  return (
    message.messageType === "system" && message.content.source === "agent_execution"
  );
}

function getExecutionStatusTone(status: string | null | undefined): string {
  switch ((status || "").trim().toLowerCase()) {
    case "completed":
      return "bg-emerald-500";
    case "failed":
      return "bg-destructive";
    case "running":
      return "bg-amber-500";
    default:
      return "bg-muted-foreground";
  }
}

function getExecutionStatusLabelKey(status: string | null | undefined): string {
  switch ((status || "").trim().toLowerCase()) {
    case "completed":
      return "conversationView.execution.status.completed";
    case "failed":
      return "conversationView.execution.status.failed";
    case "running":
      return "conversationView.execution.status.running";
    default:
      return "conversationView.execution.status.queued";
  }
}

export function MessageRow({
  message,
  agents = [],
  presets = [],
  channelLabel,
  isSaved = false,
  compact = false,
  onOpenThread,
  onOpenExecution,
  onToggleSaved,
}: {
  message: ServerConversationMessage;
  agents?: ServerAgentItem[];
  presets?: Preset[];
  channelLabel?: string;
  isSaved?: boolean;
  compact?: boolean;
  onOpenThread: () => void;
  onOpenExecution?: ((sessionId: string) => void) | undefined;
  onToggleSaved: () => void;
}) {
  const { t } = useT("translation");
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [shouldCollapse, setShouldCollapse] = React.useState(false);
  const agentMessageRef = React.useRef<HTMLDivElement>(null);
  const author = getMessageAuthor(message);
  const text = getMessageText(message);
  const executionMessage = isExecutionMessage(message) ? message : null;
  const isAgentSessionMessage =
    message.messageType === "system" && message.content.source === "agent_session";
  const avatarUrl = getUserAvatarUrl(message.authorUser);
  const matchingAgent =
    message.messageType === "system"
      ? agents.find((agent) => {
          const contentHandle =
            typeof message.content.agent_handle === "string"
              ? message.content.agent_handle.trim().toLowerCase()
              : "";
          const contentActor =
            typeof message.content.actor_label === "string"
              ? message.content.actor_label.trim().toLowerCase()
              : "";
          return (
            (contentHandle && agent.handle.trim().toLowerCase() === contentHandle) ||
            (contentActor &&
              agent.displayName.trim().toLowerCase() === contentActor)
          );
        }) ?? null
      : null;
  const executionSessionId =
    executionMessage && typeof executionMessage.content.session_id === "string"
      ? executionMessage.content.session_id
      : null;
  const canCollapseAgentMessage = isAgentSessionMessage && !compact && Boolean(text);

  React.useEffect(() => {
    setIsExpanded(false);
  }, [message.id, text]);

  React.useEffect(() => {
    if (!canCollapseAgentMessage) {
      setShouldCollapse(false);
      return;
    }

    const element = agentMessageRef.current;
    if (!element) return;

    const checkOverflow = () => {
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
      const thresholdHeight = lineHeight * AGENT_MESSAGE_COLLAPSE_LINES;
      setShouldCollapse(element.scrollHeight > thresholdHeight + 1);
    };

    checkOverflow();

    const observer = new ResizeObserver(checkOverflow);
    observer.observe(element);

    return () => observer.disconnect();
  }, [canCollapseAgentMessage, text]);

  return (
    <article
      className={cn(
        "group flex gap-4 border-b border-border px-6 py-5 last:border-b-0",
        compact && "max-h-[26rem] overflow-hidden",
      )}
    >
      {matchingAgent ? (
        <ServerAgentAvatar
          agent={matchingAgent}
          presets={presets}
          className="size-11 shrink-0"
          fallbackClassName="text-sm"
        />
      ) : (
        <Avatar className="size-11 shrink-0 rounded-md border border-border">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={author} /> : null}
          <AvatarFallback className="rounded-md bg-muted text-sm font-semibold text-foreground">
            {getInitials(author)}
          </AvatarFallback>
        </Avatar>
      )}
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
        {executionMessage ? (
          <button
            type="button"
            onClick={() => {
              if (executionSessionId && onOpenExecution) {
                onOpenExecution(executionSessionId);
              }
            }}
            disabled={!executionSessionId || !onOpenExecution}
            className={cn(
              "w-full rounded-md border border-border bg-muted/20 p-4 text-left",
              executionSessionId && onOpenExecution
                ? "transition-colors hover:bg-muted/35"
                : "cursor-default",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      getExecutionStatusTone(executionMessage.content.execution_status),
                    )}
                  />
                  {t(
                    getExecutionStatusLabelKey(
                      executionMessage.content.execution_status,
                    ),
                  )}
                </span>
                {executionMessage.content.todo_progress &&
                executionMessage.content.todo_progress.total > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t("conversationView.execution.todoProgress", {
                      completed:
                        executionMessage.content.todo_progress.completed ?? 0,
                      total: executionMessage.content.todo_progress.total ?? 0,
                    })}
                  </span>
                ) : null}
              </div>
              {executionMessage.content.current_step ? (
                <p className="min-w-0 max-w-[40%] truncate text-right text-sm font-medium text-foreground">
                  {executionMessage.content.current_step}
                </p>
              ) : null}
            </div>
            <div className="mt-2 cursor-text select-text text-sm leading-6 text-muted-foreground">
              <ServerMessageContent
                content={text || t("conversationView.execution.emptySummary")}
              />
            </div>
          </button>
        ) : (
          <div className="group/message min-w-0">
            <div
              ref={agentMessageRef}
              className={cn(
                "relative cursor-text select-text text-base leading-7 text-foreground",
                compact && "max-h-[15rem] overflow-hidden",
                canCollapseAgentMessage &&
                  shouldCollapse &&
                  !isExpanded &&
                  "max-h-56 overflow-hidden",
              )}
            >
              <ServerMessageContent
                content={text || t("conversationView.emptyMessage")}
              />
              {canCollapseAgentMessage && shouldCollapse && !isExpanded ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end bg-gradient-to-t from-background via-background/90 to-transparent">
                  <span className="text-sm leading-none text-muted-foreground">
                    ...
                  </span>
                </div>
              ) : null}
            </div>
            {canCollapseAgentMessage && shouldCollapse ? (
              <button
                type="button"
                onClick={() => setIsExpanded((value) => !value)}
                className="mt-2 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="size-4" />
                    {t("chat.collapse")}
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-4" />
                    {t("chat.expand")}
                  </>
                )}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}
