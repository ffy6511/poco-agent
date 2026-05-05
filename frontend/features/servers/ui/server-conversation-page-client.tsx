"use client";

import * as React from "react";
import {
  Bookmark,
  CircleDashed,
  ChevronDown,
  Hash,
  Inbox,
  LayoutGrid,
  LayoutList,
  Lock,
  MessageSquare,
  Search,
  Send,
  Settings2,
  Square,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { channelTasksApi } from "@/features/channel-tasks/api/channel-tasks-api";
import {
  buildChannelTaskColumns,
  buildChannelTaskListGroups,
  resolveChannelTaskView,
} from "@/features/channel-tasks/lib/channel-task-board";
import type {
  ChannelTask,
  ChannelTaskActivityMessage,
  ChannelTaskStatus,
  ChannelTaskView,
} from "@/features/channel-tasks/model/types";
import { serversApi } from "@/features/servers";
import type {
  ServerAgentItem,
  ServerChannelItem,
  ServerConversationMessage,
  ServerItem,
} from "@/features/servers/model/types";
import { useLanguage } from "@/hooks/use-language";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type WorkspaceMode = "search" | "inbox" | "saved" | "conversation";
type ConversationTab = "chat" | "tasks";
type DrawerState =
  | { type: "none" }
  | { type: "thread"; channelId: string; rootMessageId: string }
  | { type: "task"; taskId: string }
  | { type: "agent"; agentId?: string | null };

type FeedItem = {
  channel: ServerChannelItem;
  message: ServerConversationMessage;
};

const LAST_SELECTION_KEY = "poco-servers-last-selection-v1";
const SAVED_MESSAGES_KEY = "poco-saved-messages-v1";

const TASK_STATUS_TONE: Record<ChannelTaskStatus, string> = {
  todo: "text-muted-foreground",
  in_progress: "text-foreground",
  in_review: "text-foreground",
  done: "text-foreground",
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeDate(value: string): string {
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
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function getInitials(value: string): string {
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

function getMessageText(message: ServerConversationMessage): string {
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

function getMessageAuthor(message: ServerConversationMessage): string {
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
          className="rounded-md border border-border bg-primary/10 px-1.5 py-0.5 text-sm font-semibold text-foreground"
        >
          {token}
        </span>
      );
    }
    return <React.Fragment key={`${token}-${index}`}>{token}</React.Fragment>;
  });
}

function loadSavedMessageIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(SAVED_MESSAGES_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((item) => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function saveSavedMessageIds(ids: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SAVED_MESSAGES_KEY, JSON.stringify([...ids]));
}

function saveLastSelection(selection: Record<string, string | null>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LAST_SELECTION_KEY, JSON.stringify(selection));
}

function loadLastSelection(): Record<string, string | null> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LAST_SELECTION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as Record<string, string | null>;
  } catch {
    return null;
  }
}

function MessageRow({
  message,
  channelLabel,
  onOpenThread,
  onToggleSaved,
  saved,
}: {
  message: ServerConversationMessage;
  channelLabel?: string;
  onOpenThread: () => void;
  onToggleSaved: () => void;
  saved: boolean;
}) {
  const { t } = useT("translation");
  const author = getMessageAuthor(message);
  const text = getMessageText(message);

  return (
    <article className="flex gap-4 border-b border-border px-6 py-5 last:border-b-0">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-sm font-semibold text-foreground">
        {getInitials(author)}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-lg font-semibold text-foreground">{author}</span>
          <span className="text-sm text-muted-foreground">
            {formatRelativeDate(message.createdAt)} {formatTime(message.createdAt)}
          </span>
          {channelLabel ? (
            <span className="text-sm text-muted-foreground">#{channelLabel}</span>
          ) : null}
        </div>
        <div className="text-base leading-7 text-foreground">
          {renderMentions(text || t("conversationView.emptyMessage"))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenThread}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
          >
            {message.replyCount > 0
              ? t("conversationView.replyCount", { count: message.replyCount })
              : t("conversationView.reply")}
          </button>
          <button
            type="button"
            onClick={onToggleSaved}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
          >
            {saved ? t("conversationView.unsave") : t("conversationView.save")}
          </button>
        </div>
      </div>
    </article>
  );
}

function SearchPanel({
  search,
  onSearchChange,
  items,
  onOpenThread,
  savedMessages,
  onToggleSaved,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  items: FeedItem[];
  onOpenThread: (item: FeedItem) => void;
  savedMessages: Set<string>;
  onToggleSaved: (messageId: string) => void;
}) {
  const { t } = useT("translation");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-md border border-border bg-muted text-foreground">
            <Search className="size-5" />
          </div>
          <div className="flex-1 rounded-md border border-border bg-background px-4 py-3">
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("conversationView.searchPlaceholder")}
              className="w-full border-none bg-transparent text-lg text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">
            ESC
          </div>
        </div>
      </div>
      <div className="border-b border-border px-6 py-5">
        <div className="flex flex-wrap gap-3">
          <div className="rounded-md border border-border bg-card px-5 py-3 text-sm font-medium text-foreground">
            {t("conversationView.myMessages")}
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-sm font-medium text-foreground">
            {t("conversationView.anyTime")}
            <ChevronDown className="size-5" />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        {items.length > 0 ? (
          items.map((item) => (
            <MessageRow
              key={item.message.id}
              message={item.message}
              channelLabel={item.channel.name}
              onOpenThread={() => onOpenThread(item)}
              saved={savedMessages.has(item.message.id)}
              onToggleSaved={() => onToggleSaved(item.message.id)}
            />
          ))
        ) : (
          <div className="flex h-full min-h-[20rem] items-center justify-center px-8 text-center">
            <div className="space-y-4">
              <Search className="mx-auto size-20 text-muted-foreground/40" />
              <p className="text-4xl font-semibold text-foreground">
                {t("conversationView.searchEverything")}
              </p>
              <p className="max-w-3xl text-2xl text-muted-foreground">
                {t("conversationView.searchEverythingDescription")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FeedPanel({
  mode,
  items,
  savedMessages,
  onOpenThread,
  onToggleSaved,
}: {
  mode: "inbox" | "saved";
  items: FeedItem[];
  savedMessages: Set<string>;
  onOpenThread: (item: FeedItem) => void;
  onToggleSaved: (messageId: string) => void;
}) {
  const { t } = useT("translation");
  const isSaved = mode === "saved";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-md border border-border bg-muted text-foreground">
            {isSaved ? <Bookmark className="size-5" /> : <Inbox className="size-5" />}
          </div>
          <div>
            <p className="text-2xl font-semibold text-foreground">
              {isSaved ? t("conversationView.saved") : t("conversationView.inbox")}
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
              onOpenThread={() => onOpenThread(item)}
              saved={savedMessages.has(item.message.id)}
              onToggleSaved={() => onToggleSaved(item.message.id)}
            />
          ))
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <p className="text-2xl text-muted-foreground">
              {isSaved ? t("conversationView.noSaved") : t("conversationView.noInbox")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadDrawer({
  thread,
  draft,
  onDraftChange,
  onSend,
  onClose,
  isSending,
}: {
  thread: ServerConversationMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
  isSending: boolean;
}) {
  const { t } = useT("translation");
  return (
    <aside className="hidden w-[28rem] shrink-0 border-l border-border bg-card lg:flex lg:flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div>
          <p className="text-2xl font-semibold text-foreground">
            {t("conversationView.threadTitle")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("conversationView.threadDescription")}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("conversationView.close")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {thread.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            onOpenThread={() => undefined}
            saved={false}
            onToggleSaved={() => undefined}
          />
        ))}
      </div>
      <div className="border-t border-border px-6 py-5">
        <Textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          rows={6}
          placeholder={t("conversationView.threadPlaceholder")}
          className="rounded-md border-border bg-background text-base shadow-none"
        />
        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" onClick={onSend} disabled={isSending || !draft.trim()}>
            <Send className="size-4" />
            {t("conversationView.send")}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function AgentDrawer({
  agents,
  selectedAgentId,
  onSelectAgent,
  onClose,
  onOpenDm,
}: {
  agents: ServerAgentItem[];
  selectedAgentId: string | null | undefined;
  onSelectAgent: (id: string) => void;
  onClose: () => void;
  onOpenDm: (agentId: string) => void;
}) {
  const { t } = useT("translation");
  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  return (
    <aside className="hidden w-[28rem] shrink-0 border-l border-border bg-card lg:flex lg:flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div>
          <p className="text-2xl font-semibold text-foreground">
            {t("servers.agents.title")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("servers.agents.description")}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("conversationView.close")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="space-y-3">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              className={cn(
                "w-full border px-4 py-4 text-left transition-colors",
                agent.id === selectedAgent?.id
                  ? "border-primary/40 bg-primary/10"
                  : "border-border bg-card hover:bg-muted/20",
              )}
            >
              <p className="text-base font-semibold text-foreground">{agent.displayName}</p>
              <p className="mt-1 text-sm text-muted-foreground">@{agent.handle}</p>
            </button>
          ))}
        </div>
        {selectedAgent ? (
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            <div className="space-y-2">
              <p className="text-lg font-semibold text-foreground">{selectedAgent.displayName}</p>
              <p className="text-sm text-muted-foreground">
                {selectedAgent.description || t("servers.agents.emptyDescription")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {selectedAgent.persistentState?.runtimeStatus ?? t("servers.agents.unknown")}
              </Badge>
              <Badge variant="outline">@{selectedAgent.handle}</Badge>
            </div>
            <div className="space-y-3 text-sm">
              <div className="border border-border px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("servers.agents.stateRoot")}
                </p>
                <p className="mt-2 break-all text-foreground">
                  {selectedAgent.persistentState?.stateRootPath ??
                    t("servers.agents.emptyValue")}
                </p>
              </div>
              <div className="border border-border px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("servers.agents.memoryFile")}
                </p>
                <p className="mt-2 break-all text-foreground">
                  {selectedAgent.persistentState?.memoryPath ??
                    t("servers.agents.emptyValue")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => onOpenDm(selectedAgent.id)}>
                <MessageSquare className="size-4" />
                {t("conversationView.messageAgent")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function TaskDrawer({
  task,
  activity,
  onClose,
}: {
  task: ChannelTask;
  activity: ChannelTaskActivityMessage[];
  onClose: () => void;
}) {
  const { t } = useT("translation");
  return (
    <aside className="hidden w-[28rem] shrink-0 border-l border-border bg-card lg:flex lg:flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div>
          <p className="text-xl font-semibold text-foreground">{task.title}</p>
          <p className="text-sm text-muted-foreground">
            {t(`channelTasks.statuses.${task.status}`)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("conversationView.close")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="space-y-4">
          <div className="border border-border px-4 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("conversationView.taskDetail")}
            </p>
            <p className="mt-2 text-sm leading-7 text-foreground">
              {task.description || t("servers.agents.emptyDescription")}
            </p>
          </div>
          <div className="border border-border px-4 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("conversationView.taskActivity")}
            </p>
            <div className="mt-3 space-y-3">
              {activity.length > 0 ? (
                activity.map((item) => (
                  <div key={item.messageId} className="border border-border px-3 py-3 text-sm text-foreground">
                    {item.textPreview || t("conversationView.emptyMessage")}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("conversationView.noTaskActivity")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ConversationContent({
  channel,
  server,
  agents,
  messages,
  tasks,
  activeTab,
  taskView,
  draft,
  asTask,
  isLoading,
  onDraftChange,
  onAsTaskChange,
  onSend,
  onOpenThread,
  onOpenAgents,
  onOpenTask,
  onSwitchTab,
  onSwitchTaskView,
  isSending,
}: {
  channel: ServerChannelItem | null;
  server: ServerItem | null;
  agents: ServerAgentItem[];
  messages: ServerConversationMessage[];
  tasks: ChannelTask[];
  activeTab: ConversationTab;
  taskView: ChannelTaskView;
  draft: string;
  asTask: boolean;
  isLoading: boolean;
  onDraftChange: (value: string) => void;
  onAsTaskChange: (value: boolean) => void;
  onSend: () => void;
  onOpenThread: (message: ServerConversationMessage) => void;
  onOpenAgents: () => void;
  onOpenTask: (taskId: string) => void;
  onSwitchTab: (tab: ConversationTab) => void;
  onSwitchTaskView: () => void;
  isSending: boolean;
}) {
  const { t } = useT("translation");
  const taskColumns = React.useMemo(() => buildChannelTaskColumns(tasks), [tasks]);
  const taskGroups = React.useMemo(() => buildChannelTaskListGroups(tasks), [tasks]);
  const Icon = channel?.conversationType === "direct_message" ? Lock : Hash;

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-foreground px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center border border-foreground bg-[var(--sidebar-primary)] text-foreground">
              <Icon className="size-7" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-3xl font-semibold text-foreground">
                {channel?.name ?? t("conversationView.loading")}
              </h2>
              <p className="truncate text-2xl text-muted-foreground">
                {server?.name ?? ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm">
              <Square className="size-4" />
            </Button>
            <Button type="button" variant="outline" size="sm">
              <Settings2 className="size-4" />
            </Button>
            <Button type="button" variant="outline" size="sm">
              {t("conversationView.leave")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onOpenAgents}>
              <Users className="size-4" />
              {agents.length}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex border-b border-foreground">
        <button
          type="button"
          onClick={() => onSwitchTab("chat")}
          className={cn(
            "border-r border-foreground px-8 py-3 text-2xl font-semibold uppercase",
            activeTab === "chat"
              ? "bg-[var(--sidebar-primary)]/35 text-foreground"
              : "bg-background text-foreground",
          )}
        >
          {t("conversationView.chatTab")}
        </button>
        <button
          type="button"
          onClick={() => onSwitchTab("tasks")}
          className={cn(
            "border-r border-foreground px-8 py-3 text-2xl font-semibold uppercase",
            activeTab === "tasks"
              ? "bg-[var(--sidebar-primary)]/35 text-foreground"
              : "bg-background text-foreground",
          )}
        >
          {t("conversationView.tasksTab")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        {isLoading ? (
          <div className="space-y-4 px-6 py-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-none" />
            ))}
          </div>
        ) : activeTab === "chat" ? (
          <div className="h-full overflow-y-auto">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                onOpenThread={() => onOpenThread(message)}
                saved={false}
                onToggleSaved={() => undefined}
              />
            ))}
          </div>
        ) : taskView === "board" ? (
          <div className="grid h-full gap-4 overflow-y-auto px-6 py-6 xl:grid-cols-4">
            {taskColumns.map((column) => (
              <section key={column.status} className="border border-foreground bg-card p-3">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
                    {t(`channelTasks.statuses.${column.status}`)}
                  </p>
                  <Badge variant="outline">{column.tasks.length}</Badge>
                </div>
                <div className="space-y-3">
                  {column.tasks.map((task) => (
                    <button
                      key={task.taskId}
                      type="button"
                      onClick={() => onOpenTask(task.taskId)}
                      className="w-full border border-border bg-background px-4 py-4 text-left transition-colors hover:bg-muted/20"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CircleDashed className={cn("size-3.5", TASK_STATUS_TONE[task.status])} />
                          <span>{t(`channelTasks.statuses.${task.status}`)}</span>
                        </div>
                        <p className="text-lg font-semibold text-foreground">{task.title}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-6 overflow-y-auto px-6 py-6">
            {taskGroups.map((group) => (
              <section key={group.status} className="space-y-3">
                <div className="flex items-center gap-3 px-1">
                  <CircleDashed className={cn("size-3.5", TASK_STATUS_TONE[group.status])} />
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
                    {t(`channelTasks.statuses.${group.status}`)}
                  </h3>
                  <span className="text-xs text-muted-foreground">{group.tasks.length}</span>
                </div>
                <div className="grid gap-3">
                  {group.tasks.map((task) => (
                    <button
                      key={task.taskId}
                      type="button"
                      onClick={() => onOpenTask(task.taskId)}
                      className="border border-foreground bg-card px-4 py-4 text-left transition-colors hover:bg-muted/20"
                    >
                      <p className="text-lg font-semibold text-foreground">{task.title}</p>
                      {task.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {task.description}
                        </p>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-foreground px-6 py-5">
        <Textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          rows={4}
          placeholder={
            activeTab === "chat"
              ? t("conversationView.messagePlaceholder", {
                  name: channel?.name ?? "",
                })
              : t("conversationView.taskComposerPlaceholder")
          }
          className="rounded-none border-foreground bg-background text-2xl shadow-none"
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-3 text-xl text-foreground">
            <input
              type="checkbox"
              checked={asTask}
              onChange={(event) => onAsTaskChange(event.target.checked)}
              className="size-5 rounded-none border-foreground"
            />
            {t("conversationView.asTask")}
          </label>
          <div className="flex items-center gap-2">
            {activeTab === "tasks" ? (
              <Button type="button" variant="outline" size="sm" onClick={onSwitchTaskView}>
                {taskView === "list" ? <LayoutGrid className="size-4" /> : <LayoutList className="size-4" />}
                {taskView === "list"
                  ? t("conversationView.boardView")
                  : t("conversationView.listView")}
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={onSend} disabled={isSending || !draft.trim()}>
              <Send className="size-4" />
              {t("conversationView.send")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ServerConversationPageClient({
  serverId,
  channelId,
}: {
  serverId?: string | null;
  channelId?: string | null;
}) {
  const { t } = useT("translation");
  const lng = useLanguage() || "en";
  const router = useRouter();
  const searchParams = useSearchParams();

  const [servers, setServers] = React.useState<ServerItem[]>([]);
  const [selectedServerId, setSelectedServerId] = React.useState<string | null>(
    serverId ?? null,
  );
  const [channels, setChannels] = React.useState<ServerChannelItem[]>([]);
  const [messagesByChannel, setMessagesByChannel] = React.useState<
    Record<string, ServerConversationMessage[]>
  >({});
  const [channelAgents, setChannelAgents] = React.useState<ServerAgentItem[]>([]);
  const [tasks, setTasks] = React.useState<ChannelTask[]>([]);
  const [threadMessages, setThreadMessages] = React.useState<ServerConversationMessage[]>([]);
  const [taskActivity, setTaskActivity] = React.useState<ChannelTaskActivityMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [threadDraft, setThreadDraft] = React.useState("");
  const [searchValue, setSearchValue] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSending, setIsSending] = React.useState(false);
  const [asTask, setAsTask] = React.useState(false);
  const [savedMessageIds, setSavedMessageIds] = React.useState<Set<string>>(new Set());
  const [mode, setMode] = React.useState<WorkspaceMode>(
    channelId ? "conversation" : "search",
  );
  const [activeTab, setActiveTab] = React.useState<ConversationTab>(
    searchParams.get("tab") === "tasks" ? "tasks" : "chat",
  );
  const [taskView, setTaskView] = React.useState<ChannelTaskView>(
    resolveChannelTaskView(searchParams.get("view")),
  );
  const [drawer, setDrawer] = React.useState<DrawerState>({ type: "none" });

  const selectedServer =
    servers.find((server) => server.id === selectedServerId) ?? null;
  const activeChannelId = channelId ?? null;
  const selectedChannel = channels.find((channel) => channel.id === activeChannelId) ?? null;
  const topLevelChannels = channels.filter(
    (channel) => channel.conversationType === "channel",
  );
  const directMessages = channels.filter(
    (channel) => channel.conversationType === "direct_message",
  );
  const currentMessages = activeChannelId ? (messagesByChannel[activeChannelId] ?? []) : [];
  const selectedTask = React.useMemo(
    () => (drawer.type === "task" ? tasks.find((task) => task.taskId === drawer.taskId) ?? null : null),
    [drawer, tasks],
  );

  const allFeedItems = React.useMemo<FeedItem[]>(() => {
    return channels.flatMap((channel) =>
      (messagesByChannel[channel.id] ?? []).map((message) => ({
        channel,
        message,
      })),
    ).sort((left, right) => {
      return Date.parse(right.message.createdAt) - Date.parse(left.message.createdAt);
    });
  }, [channels, messagesByChannel]);

  const filteredSearchItems = React.useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) {
      return [];
    }
    return allFeedItems.filter((item) => {
      const haystack = `${item.channel.name} ${getMessageText(item.message)} ${getMessageAuthor(item.message)}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [allFeedItems, searchValue]);

  const inboxItems = React.useMemo(() => allFeedItems, [allFeedItems]);
  const savedItems = React.useMemo(
    () => allFeedItems.filter((item) => savedMessageIds.has(item.message.id)),
    [allFeedItems, savedMessageIds],
  );

  const loadServers = React.useCallback(async () => {
    const nextServers = await serversApi.listServers();
    setServers(nextServers);

    const requestedServerId = serverId || searchParams.get("server");
    const lastSelection = loadLastSelection();
    const preferredServerId =
      requestedServerId ||
      lastSelection?.serverId ||
      nextServers[0]?.id ||
      null;
    setSelectedServerId(preferredServerId);

    if (!channelId && lastSelection?.mode && !searchParams.get("mode")) {
      setMode(
        lastSelection.mode === "channel" || lastSelection.mode === "dm"
          ? "search"
          : (lastSelection.mode as WorkspaceMode),
      );
    } else if (!channelId) {
      const routeMode = searchParams.get("mode");
      if (routeMode === "search" || routeMode === "inbox" || routeMode === "saved") {
        setMode(routeMode);
      }
    }
  }, [channelId, searchParams, serverId]);

  React.useEffect(() => {
    setSavedMessageIds(loadSavedMessageIds());
    void loadServers();
  }, [loadServers]);

  React.useEffect(() => {
    const loadServerContext = async () => {
      if (!selectedServerId) {
        setChannels([]);
        setMessagesByChannel({});
        return;
      }
      setIsLoading(true);
      try {
        const nextChannels = await serversApi.listChannels(selectedServerId);
        setChannels(nextChannels);

        const previews = await Promise.all(
          nextChannels.map(async (channel) => {
            const messages = await serversApi.listMessages(selectedServerId, channel.id);
            return [channel.id, messages] as const;
          }),
        );
        setMessagesByChannel(Object.fromEntries(previews));

        if (activeChannelId) {
          const [nextTasks, nextAgents] = await Promise.all([
            channelTasksApi.listTasks(selectedServerId, activeChannelId),
            serversApi.listChannelAgents(selectedServerId, activeChannelId),
          ]);
          setTasks(nextTasks);
          setChannelAgents(nextAgents);
        } else {
          setTasks([]);
          setChannelAgents([]);
        }
      } catch (error) {
        console.error("[ServersWorkspace] load failed", error);
        toast.error(t("conversationView.toasts.loadFailed"));
      } finally {
        setIsLoading(false);
      }
    };

    void loadServerContext();
  }, [activeChannelId, selectedServerId, t]);

  React.useEffect(() => {
    const lastSelection = loadLastSelection();
    if (
      !channelId &&
      selectedServerId &&
      lastSelection?.serverId === selectedServerId &&
      (lastSelection.mode === "channel" || lastSelection.mode === "dm") &&
      lastSelection.channelId
    ) {
      router.replace(
        `/${lng}/servers/${selectedServerId}/channels/${lastSelection.channelId}?tab=chat`,
      );
    }
  }, [channelId, lng, router, selectedServerId]);

  React.useEffect(() => {
    const loadThread = async () => {
      if (drawer.type !== "thread" || !selectedServerId) {
        setThreadMessages([]);
        return;
      }
      try {
        setThreadMessages(
          await serversApi.getThread(
            selectedServerId,
            drawer.channelId,
            drawer.rootMessageId,
          ),
        );
      } catch (error) {
        console.error("[ServersWorkspace] thread load failed", error);
        toast.error(t("conversationView.toasts.threadFailed"));
      }
    };

    void loadThread();
  }, [drawer, selectedServerId, t]);

  React.useEffect(() => {
    const loadTaskActivity = async () => {
      if (!selectedServerId || !activeChannelId || !selectedTask?.threadRootMessageId) {
        setTaskActivity([]);
        return;
      }
      try {
        setTaskActivity(
          await channelTasksApi.getTaskThread(
            selectedServerId,
            activeChannelId,
            selectedTask.threadRootMessageId,
          ),
        );
      } catch (error) {
        console.error("[ServersWorkspace] task activity load failed", error);
      }
    };

    void loadTaskActivity();
  }, [activeChannelId, selectedServerId, selectedTask?.threadRootMessageId]);

  const openMode = (nextMode: WorkspaceMode) => {
    setMode(nextMode);
    setDrawer({ type: "none" });
    if (nextMode === "conversation" || !selectedServerId) {
      return;
    }
    saveLastSelection({
      mode: nextMode,
      serverId: selectedServerId,
      channelId: null,
    });
    router.replace(`/${lng}/servers?mode=${nextMode}&server=${selectedServerId}`);
  };

  const openChannel = (channel: ServerChannelItem) => {
    if (!selectedServerId) {
      return;
    }
    saveLastSelection({
      mode: channel.conversationType === "direct_message" ? "dm" : "channel",
      serverId: selectedServerId,
      channelId: channel.id,
    });
    router.push(`/${lng}/servers/${selectedServerId}/channels/${channel.id}?tab=chat`);
  };

  const handleSend = async () => {
    if (!selectedServerId || !activeChannelId) {
      return;
    }
    const content = draft.trim();
    if (!content) {
      return;
    }
    setIsSending(true);
    try {
      if (asTask) {
        const title = content.split("\n")[0]?.trim().slice(0, 80) || content.slice(0, 80);
        await channelTasksApi.createTask(selectedServerId, activeChannelId, {
          title,
          description: content,
        });
        setActiveTab("tasks");
        toast.success(t("conversationView.toasts.taskCreated"));
      } else {
        await serversApi.sendMessage(selectedServerId, activeChannelId, {
          text: content,
        });
      }
      setDraft("");
      setAsTask(false);
      const messages = await serversApi.listMessages(selectedServerId, activeChannelId);
      setMessagesByChannel((current) => ({ ...current, [activeChannelId]: messages }));
      if (asTask) {
        setTasks(await channelTasksApi.listTasks(selectedServerId, activeChannelId));
      }
    } catch (error) {
      console.error("[ServersWorkspace] send failed", error);
      toast.error(t("conversationView.toasts.sendFailed"));
    } finally {
      setIsSending(false);
    }
  };

  const handleReply = async () => {
    if (
      drawer.type !== "thread" ||
      !selectedServerId ||
      !threadDraft.trim()
    ) {
      return;
    }
    setIsSending(true);
    try {
      await serversApi.sendMessage(selectedServerId, drawer.channelId, {
        text: threadDraft.trim(),
        threadRootMessageId: drawer.rootMessageId,
      });
      setThreadDraft("");
      const [messages, thread] = await Promise.all([
        serversApi.listMessages(selectedServerId, drawer.channelId),
        serversApi.getThread(selectedServerId, drawer.channelId, drawer.rootMessageId),
      ]);
      setMessagesByChannel((current) => ({ ...current, [drawer.channelId]: messages }));
      setThreadMessages(thread);
    } catch (error) {
      console.error("[ServersWorkspace] reply failed", error);
      toast.error(t("conversationView.toasts.replyFailed"));
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenDm = async (agentId: string) => {
    if (!selectedServerId) {
      return;
    }
    try {
      const dm = await serversApi.createDirectMessage(selectedServerId, {
        targetAgentIdentityId: agentId,
      });
      openChannel(dm);
    } catch (error) {
      console.error("[ServersWorkspace] create dm failed", error);
      toast.error(t("conversationView.toasts.dmFailed"));
    }
  };

  const toggleSaved = (messageId: string) => {
    setSavedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      saveSavedMessageIds(next);
      return next;
    });
  };

  return (
    <main className="flex h-[calc(100vh-4rem)] min-h-0 flex-1 overflow-hidden border-t border-foreground bg-background">
      <aside className="hidden w-[24rem] shrink-0 border-r border-foreground bg-[var(--sidebar)] md:flex md:flex-col">
        <div className="border-b border-foreground px-6 py-5">
          <p className="text-3xl font-semibold text-foreground">
            {t("conversationView.title")}
          </p>
          <div className="mt-4">
            <Select
              value={selectedServerId ?? ""}
              onValueChange={(value) => setSelectedServerId(value)}
            >
              <SelectTrigger className="w-full rounded-none border-foreground bg-background text-lg">
                <SelectValue placeholder={t("servers.title")} />
              </SelectTrigger>
              <SelectContent>
                {servers.map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="space-y-2">
            {([
              ["search", Search],
              ["inbox", Inbox],
              ["saved", Bookmark],
            ] as const).map(([key, Icon]) => {
              const isActive = !channelId && mode === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => openMode(key as WorkspaceMode)}
                  className={cn(
                    "flex w-full items-center justify-between border px-4 py-4 text-left transition-colors",
                    isActive
                      ? "border-foreground bg-[var(--sidebar-primary)]/55 text-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted/20",
                  )}
                >
                  <span className="flex items-center gap-3 text-2xl">
                    <Icon className="size-6" />
                    {t(`conversationView.${key}`)}
                  </span>
                  {key === "inbox" ? (
                    <span className="text-xl text-muted-foreground">{inboxItems.length}</span>
                  ) : key === "saved" ? (
                    <span className="text-xl text-muted-foreground">{savedItems.length}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
                {t("conversationView.channels")}
              </p>
              <Button type="button" variant="outline" size="sm">
                +
              </Button>
            </div>
            <div className="space-y-2">
              {topLevelChannels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => openChannel(channel)}
                  className={cn(
                    "flex w-full items-center gap-3 border px-4 py-4 text-left transition-colors",
                    channel.id === activeChannelId
                      ? "border-foreground bg-[var(--sidebar-primary)]/55 text-foreground"
                      : "border-transparent bg-transparent text-foreground hover:bg-muted/20",
                  )}
                >
                  <Hash className="size-6" />
                  <span className="truncate text-2xl">{channel.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
                {t("conversationView.directMessages")}
              </p>
              <span className="text-xs text-muted-foreground">{directMessages.length}</span>
            </div>
            <div className="space-y-2">
              {directMessages.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => openChannel(channel)}
                  className={cn(
                    "flex w-full items-center gap-3 border px-4 py-4 text-left transition-colors",
                    channel.id === activeChannelId
                      ? "border-foreground bg-[var(--sidebar-primary)]/55 text-foreground"
                      : "border-transparent bg-transparent text-foreground hover:bg-muted/20",
                  )}
                >
                  <MessageSquare className="size-6" />
                  <span className="truncate text-2xl">{channel.name}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </aside>

      {!channelId ? (
        <section className="flex min-w-0 flex-1 flex-col">
          {mode === "search" ? (
            <SearchPanel
              search={searchValue}
              onSearchChange={setSearchValue}
              items={filteredSearchItems}
              onOpenThread={(item) =>
                setDrawer({
                  type: "thread",
                  channelId: item.channel.id,
                  rootMessageId: item.message.id,
                })
              }
              savedMessages={savedMessageIds}
              onToggleSaved={toggleSaved}
            />
          ) : mode === "saved" ? (
            <FeedPanel
              mode="saved"
              items={savedItems}
              savedMessages={savedMessageIds}
              onOpenThread={(item) =>
                setDrawer({
                  type: "thread",
                  channelId: item.channel.id,
                  rootMessageId: item.message.id,
                })
              }
              onToggleSaved={toggleSaved}
            />
          ) : (
            <FeedPanel
              mode="inbox"
              items={inboxItems}
              savedMessages={savedMessageIds}
              onOpenThread={(item) =>
                setDrawer({
                  type: "thread",
                  channelId: item.channel.id,
                  rootMessageId: item.message.id,
                })
              }
              onToggleSaved={toggleSaved}
            />
          )}
        </section>
      ) : (
        <ConversationContent
          channel={selectedChannel}
          server={selectedServer}
          agents={channelAgents}
          messages={currentMessages}
          tasks={tasks}
          activeTab={activeTab}
          taskView={taskView}
          draft={draft}
          asTask={asTask}
          isLoading={isLoading}
          onDraftChange={setDraft}
          onAsTaskChange={setAsTask}
          onSend={() => void handleSend()}
          onOpenThread={(message) =>
            setDrawer({
              type: "thread",
              channelId: activeChannelId!,
              rootMessageId: message.id,
            })
          }
          onOpenAgents={() => setDrawer({ type: "agent" })}
          onOpenTask={(taskId) => setDrawer({ type: "task", taskId })}
          onSwitchTab={(tab) => {
            setActiveTab(tab);
            router.replace(
              `/${lng}/servers/${selectedServerId}/channels/${activeChannelId}?tab=${tab}${tab === "tasks" ? `&view=${taskView}` : ""}`,
              { scroll: false },
            );
          }}
          onSwitchTaskView={() => {
            const nextView = taskView === "list" ? "board" : "list";
            setTaskView(nextView);
            router.replace(
              `/${lng}/servers/${selectedServerId}/channels/${activeChannelId}?tab=tasks&view=${nextView}`,
              { scroll: false },
            );
          }}
          isSending={isSending}
        />
      )}

      {drawer.type === "thread" ? (
        <ThreadDrawer
          thread={threadMessages}
          draft={threadDraft}
          onDraftChange={setThreadDraft}
          onSend={() => void handleReply()}
          onClose={() => setDrawer({ type: "none" })}
          isSending={isSending}
        />
      ) : drawer.type === "task" && selectedTask ? (
        <TaskDrawer
          task={selectedTask}
          activity={taskActivity}
          onClose={() => setDrawer({ type: "none" })}
        />
      ) : drawer.type === "agent" ? (
        <AgentDrawer
          agents={channelAgents}
          selectedAgentId={drawer.agentId}
          onSelectAgent={(id) => setDrawer({ type: "agent", agentId: id })}
          onClose={() => setDrawer({ type: "none" })}
          onOpenDm={handleOpenDm}
        />
      ) : null}
    </main>
  );
}
