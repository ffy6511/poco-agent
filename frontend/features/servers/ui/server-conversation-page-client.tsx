"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bookmark,
  CircleDashed,
  Hash,
  Inbox,
  LayoutGrid,
  LayoutList,
  Lock,
  MessageSquare,
  Search,
  Send,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { channelTasksApi } from "@/features/channel-tasks/api/channel-tasks-api";
import {
  buildChannelTaskColumns,
  buildChannelTaskListGroups,
  resolveChannelTaskView,
} from "@/features/channel-tasks/lib/channel-task-board";
import type {
  ChannelTaskActivityMessage,
  ChannelTask,
  ChannelTaskStatus,
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

type ConversationTab = "chat" | "tasks";
type ContextPanel = "agents" | "agent" | "thread" | "task";

const TASK_STATUS_TONE: Record<ChannelTaskStatus, string> = {
  todo: "text-muted-foreground",
  in_progress: "text-primary",
  in_review: "text-primary",
  done: "text-primary",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getInitials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "?";
  }
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
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
          className="rounded-md bg-primary/15 px-1.5 py-0.5 font-semibold text-foreground"
        >
          {token}
        </span>
      );
    }
    return <React.Fragment key={`${token}-${index}`}>{token}</React.Fragment>;
  });
}

function ConversationMessageCard({
  message,
  onOpenThread,
}: {
  message: ServerConversationMessage;
  onOpenThread: (messageId: string) => void;
}) {
  const { t } = useT("translation");
  const author = getMessageAuthor(message);
  const text = getMessageText(message);
  const typeBadge =
    message.messageType === "task"
      ? t("conversationView.taskBadge")
      : message.messageType === "system"
        ? t("conversationView.systemBadge")
        : null;

  return (
    <article className="flex gap-3 rounded-2xl border border-border/60 bg-card px-4 py-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-sm font-semibold text-foreground">
        {getInitials(author)}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">{author}</span>
          {typeBadge ? <Badge variant="outline">{typeBadge}</Badge> : null}
          <span className="text-muted-foreground">{formatDateTime(message.createdAt)}</span>
        </div>
        <div className="text-sm leading-7 text-foreground">
          {renderMentions(text || t("conversationView.emptyMessage"))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            className="rounded-md border border-border/60 bg-background px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-muted/40"
            onClick={() => onOpenThread(message.id)}
          >
            {message.replyCount > 0
              ? t("conversationView.replyCount", { count: message.replyCount })
              : t("conversationView.reply")}
          </button>
        </div>
      </div>
    </article>
  );
}

function AgentPanel({
  agent,
  onOpenDm,
}: {
  agent: ServerAgentItem;
  onOpenDm: (agentId: string) => void;
}) {
  const { t } = useT("translation");
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border/70 bg-card p-5">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">{agent.displayName}</p>
          <p className="text-sm text-muted-foreground">
            {agent.description || t("servers.agents.emptyDescription")}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="secondary">{agent.persistentState?.runtimeStatus ?? t("servers.agents.unknown")}</Badge>
          <Badge variant="outline">@{agent.handle}</Badge>
          <Badge variant="outline">
            {t("servers.agents.preset", { id: agent.presetId })}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => onOpenDm(agent.id)}>
            <MessageSquare className="size-4" />
            {t("conversationView.messageAgent")}
          </Button>
        </div>
      </div>
      <div className="rounded-3xl border border-border/70 bg-card p-5">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">
            {t("servers.agents.stateSummaryTitle")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("servers.agents.stateSummaryDescription")}
          </p>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("servers.agents.stateRoot")}
            </p>
            <p className="mt-2 break-all text-foreground">
              {agent.persistentState?.stateRootPath ?? t("servers.agents.emptyValue")}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("servers.agents.memoryFile")}
            </p>
            <p className="mt-2 break-all text-foreground">
              {agent.persistentState?.memoryPath ?? t("servers.agents.emptyValue")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadPanel({
  thread,
  draft,
  onDraftChange,
  onSend,
  isSending,
  onBack,
}: {
  thread: ServerConversationMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  onBack: () => void;
}) {
  const { t } = useT("translation");
  return (
    <div className="flex h-full min-h-0 flex-col rounded-3xl border border-border/70 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {t("conversationView.threadTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("conversationView.threadDescription")}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          {t("conversationView.backToContext")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {thread.map((message) => (
          <ConversationMessageCard
            key={message.id}
            message={message}
            onOpenThread={() => undefined}
          />
        ))}
      </div>
      <div className="border-t border-border/60 px-5 py-4">
        <Textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          rows={4}
          placeholder={t("conversationView.threadPlaceholder")}
          className="rounded-2xl border-border/60 bg-background/80 shadow-none"
        />
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" onClick={onSend} disabled={isSending || !draft.trim()}>
            <Send className="size-4" />
            {t("conversationView.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskPanel({
  task,
  activity,
  onBack,
}: {
  task: ChannelTask;
  activity: ChannelTaskActivityMessage[];
  onBack: () => void;
}) {
  const { t } = useT("translation");
  return (
    <div className="flex h-full min-h-0 flex-col rounded-3xl border border-border/70 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{task.title}</p>
          <p className="text-xs text-muted-foreground">
            {t(`channelTasks.statuses.${task.status}`)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          {t("conversationView.backToContext")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t("conversationView.taskDetail")}
          </p>
          <p className="mt-2 text-sm text-foreground">
            {task.description || t("servers.agents.emptyDescription")}
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t("conversationView.taskActivity")}
          </p>
          <div className="mt-3 space-y-3">
            {activity.length > 0 ? (
              activity.map((item) => (
                <div key={item.messageId} className="rounded-xl border border-border/60 bg-card px-3 py-3 text-sm text-foreground">
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
  );
}

export function ServerConversationPageClient({
  serverId,
  channelId,
}: {
  serverId: string;
  channelId: string;
}) {
  const { t } = useT("translation");
  const lng = useLanguage() || "en";
  const router = useRouter();
  const searchParams = useSearchParams();

  const [servers, setServers] = React.useState<ServerItem[]>([]);
  const [channels, setChannels] = React.useState<ServerChannelItem[]>([]);
  const [channelAgents, setChannelAgents] = React.useState<ServerAgentItem[]>([]);
  const [messages, setMessages] = React.useState<ServerConversationMessage[]>([]);
  const [tasks, setTasks] = React.useState<ChannelTask[]>([]);
  const [threadMessages, setThreadMessages] = React.useState<ServerConversationMessage[]>([]);
  const [taskActivity, setTaskActivity] = React.useState<ChannelTaskActivityMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [draft, setDraft] = React.useState("");
  const [threadDraft, setThreadDraft] = React.useState("");
  const [asTask, setAsTask] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  const selectedThreadId = searchParams.get("thread");
  const selectedAgentId = searchParams.get("agent");
  const selectedTaskId = searchParams.get("task");
  const taskView = resolveChannelTaskView(searchParams.get("view"));
  const activeTab: ConversationTab = (() => {
    const tab = searchParams.get("tab");
    if (tab === "chat" || tab === "tasks") {
      return tab;
    }
    return searchParams.get("view") ? "tasks" : "chat";
  })();

  const selectedServer = servers.find((server) => server.id === serverId) ?? null;
  const selectedChannel = channels.find((channel) => channel.id === channelId) ?? null;
  const directMessages = channels.filter(
    (channel) => channel.conversationType === "direct_message",
  );
  const topLevelChannels = channels.filter(
    (channel) => channel.conversationType === "channel",
  );
  const selectedAgent =
    channelAgents.find((agent) => agent.id === selectedAgentId) ?? channelAgents[0] ?? null;
  const selectedTask =
    tasks.find((task) => task.taskId === selectedTaskId) ?? null;
  const contextPanel: ContextPanel = selectedThreadId
    ? "thread"
    : selectedTask && activeTab === "tasks"
      ? "task"
    : selectedAgentId || channelAgents.length > 0
      ? "agent"
      : "agents";
  const taskColumns = React.useMemo(() => buildChannelTaskColumns(tasks), [tasks]);
  const taskGroups = React.useMemo(() => buildChannelTaskListGroups(tasks), [tasks]);

  const loadConversation = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextServers, nextChannels, nextMessages, nextTasks, nextAgents] =
        await Promise.all([
          serversApi.listServers(),
          serversApi.listChannels(serverId),
          serversApi.listMessages(serverId, channelId),
          channelTasksApi.listTasks(serverId, channelId),
          serversApi.listChannelAgents(serverId, channelId),
        ]);
      setServers(nextServers);
      setChannels(nextChannels);
      setMessages(nextMessages);
      setTasks(nextTasks);
      setChannelAgents(nextAgents);
    } catch (error) {
      console.error("[Conversation] load failed", error);
      toast.error(t("conversationView.toasts.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [channelId, serverId, t]);

  React.useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  React.useEffect(() => {
    const loadThread = async () => {
      if (!selectedThreadId) {
        setThreadMessages([]);
        return;
      }
      try {
        setThreadMessages(
          await serversApi.getThread(serverId, channelId, selectedThreadId),
        );
      } catch (error) {
        console.error("[Conversation] thread load failed", error);
        toast.error(t("conversationView.toasts.threadFailed"));
      }
    };

    void loadThread();
  }, [channelId, selectedThreadId, serverId, t]);

  React.useEffect(() => {
    const loadTaskActivity = async () => {
      if (!selectedTask?.threadRootMessageId) {
        setTaskActivity([]);
        return;
      }
      try {
        setTaskActivity(
          await channelTasksApi.getTaskThread(
            serverId,
            channelId,
            selectedTask.threadRootMessageId,
          ),
        );
      } catch (error) {
        console.error("[Conversation] task activity load failed", error);
        toast.error(t("conversationView.toasts.threadFailed"));
      }
    };

    void loadTaskActivity();
  }, [channelId, selectedTask?.threadRootMessageId, serverId, t]);

  const updateQuery = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.replace(
      `/${lng}/servers/${serverId}/channels/${channelId}${params.toString() ? `?${params.toString()}` : ""}`,
      { scroll: false },
    );
  };

  const handleSend = async () => {
    const content = draft.trim();
    if (!content) {
      return;
    }
    setIsSending(true);
    try {
      if (asTask) {
        const title = content.split("\n")[0]?.trim().slice(0, 80) || content.slice(0, 80);
        await channelTasksApi.createTask(serverId, channelId, {
          title,
          description: content,
        });
        updateQuery({ tab: "tasks" });
        toast.success(t("conversationView.toasts.taskCreated"));
      } else {
        await serversApi.sendMessage(serverId, channelId, { text: content });
      }
      setDraft("");
      setAsTask(false);
      await loadConversation();
    } catch (error) {
      console.error("[Conversation] send failed", error);
      toast.error(t("conversationView.toasts.sendFailed"));
    } finally {
      setIsSending(false);
    }
  };

  const handleSendThreadReply = async () => {
    if (!selectedThreadId || !threadDraft.trim()) {
      return;
    }
    setIsSending(true);
    try {
      await serversApi.sendMessage(serverId, channelId, {
        text: threadDraft.trim(),
        threadRootMessageId: selectedThreadId,
      });
      setThreadDraft("");
      setMessages(await serversApi.listMessages(serverId, channelId));
      setThreadMessages(await serversApi.getThread(serverId, channelId, selectedThreadId));
    } catch (error) {
      console.error("[Conversation] reply failed", error);
      toast.error(t("conversationView.toasts.replyFailed"));
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenDm = async (agentId: string) => {
    try {
      const dm = await serversApi.createDirectMessage(serverId, {
        targetAgentIdentityId: agentId,
      });
      router.push(`/${lng}/servers/${serverId}/channels/${dm.id}`);
    } catch (error) {
      console.error("[Conversation] create dm failed", error);
      toast.error(t("conversationView.toasts.dmFailed"));
    }
  };

  const channelIcon = selectedChannel?.conversationType === "direct_message" ? Lock : Hash;
  const ChannelIcon = channelIcon;

  return (
    <main className="flex h-[calc(100vh-4rem)] min-h-0 flex-1 overflow-hidden border-t border-border/60 bg-background">
      <aside className="hidden w-[21rem] shrink-0 border-r border-border/70 bg-card/50 xl:flex xl:flex-col">
        <div className="border-b border-border/60 px-6 py-5">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {t("conversationView.title")}
          </h1>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="space-y-3">
            <button type="button" className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 text-left text-sm text-foreground">
              <Search className="size-4 text-muted-foreground" />
              <span>{t("conversationView.search")}</span>
            </button>
            <button type="button" className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 text-left text-sm text-foreground">
              <Inbox className="size-4 text-muted-foreground" />
              <span>{t("conversationView.inbox")}</span>
            </button>
            <button type="button" className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 text-left text-sm text-foreground">
              <Bookmark className="size-4 text-muted-foreground" />
              <span>{t("conversationView.saved")}</span>
            </button>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("conversationView.channels")}
              </p>
              <span className="text-xs text-muted-foreground">{topLevelChannels.length}</span>
            </div>
            <div className="space-y-2">
              {topLevelChannels.map((channel) => (
                <Link
                  key={channel.id}
                  href={`/${lng}/servers/${serverId}/channels/${channel.id}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors",
                    channel.id === channelId
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/60 bg-background text-foreground hover:bg-muted/30",
                  )}
                >
                  <Hash className="size-4 text-muted-foreground" />
                  <span className="truncate">{channel.name}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("conversationView.directMessages")}
              </p>
              <span className="text-xs text-muted-foreground">{directMessages.length}</span>
            </div>
            <div className="space-y-2">
              {directMessages.length > 0 ? (
                directMessages.map((channel) => (
                  <Link
                    key={channel.id}
                    href={`/${lng}/servers/${serverId}/channels/${channel.id}`}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors",
                      channel.id === channelId
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border/60 bg-background text-foreground hover:bg-muted/30",
                    )}
                  >
                    <MessageSquare className="size-4 text-muted-foreground" />
                    <span className="truncate">{channel.name}</span>
                  </Link>
                ))
              ) : (
                <p className="px-1 text-sm text-muted-foreground">
                  {t("conversationView.noDirectMessages")}
                </p>
              )}
            </div>
          </section>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col border-r border-border/70">
        <div className="border-b border-border/70 px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-card">
                  <ChannelIcon className="size-5 text-foreground" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold text-foreground">
                    {selectedChannel?.name ?? channelId}
                  </h2>
                  <p className="truncate text-sm text-muted-foreground">
                    {selectedServer?.name ?? t("conversationView.loading")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                <Users className="size-3.5" />
                {channelAgents.length}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center border-b border-border/70 px-6">
          <button
            type="button"
            onClick={() => updateQuery({ tab: "chat", thread: null })}
            className={cn(
              "border-r border-border/70 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em]",
              activeTab === "chat" ? "bg-primary/15 text-foreground" : "text-muted-foreground",
            )}
          >
            {t("conversationView.chatTab")}
          </button>
          <button
            type="button"
            onClick={() => updateQuery({ tab: "tasks" })}
            className={cn(
              "px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em]",
              activeTab === "tasks" ? "bg-primary/15 text-foreground" : "text-muted-foreground",
            )}
          >
            {t("conversationView.tasksTab")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-3xl" />
              ))}
            </div>
          ) : activeTab === "chat" ? (
            <div className="h-full min-h-0 space-y-4 overflow-y-auto pr-2">
              {messages.map((message) => (
                <ConversationMessageCard
                  key={message.id}
                  message={message}
                  onOpenThread={(messageId) => updateQuery({ thread: messageId })}
                />
              ))}
            </div>
          ) : taskView === "board" ? (
            <div className="grid gap-4 xl:grid-cols-4">
              {taskColumns.map((column) => (
                <section
                  key={column.status}
                  className="rounded-3xl border border-border/70 bg-card p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <p className="text-sm font-semibold text-foreground">
                      {t(`channelTasks.statuses.${column.status}`)}
                    </p>
                    <Badge variant="outline">{column.tasks.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {column.tasks.map((task) => (
                      <button
                        key={task.taskId}
                        type="button"
                        onClick={() => updateQuery({ task: task.taskId })}
                        className="w-full rounded-2xl border border-border/60 bg-background/80 px-4 py-4 text-left"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CircleDashed className={cn("size-3.5", TASK_STATUS_TONE[task.status])} />
                            <span>{t(`channelTasks.statuses.${task.status}`)}</span>
                          </div>
                          <p className="text-sm font-semibold text-foreground">{task.title}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-6 overflow-y-auto pr-2">
              {taskGroups.map((group) => (
                <section key={group.status} className="space-y-3">
                  <div className="flex items-center gap-3 px-1">
                    <CircleDashed className={cn("size-3.5", TASK_STATUS_TONE[group.status])} />
                    <h3 className="text-sm font-semibold text-foreground">
                      {t(`channelTasks.statuses.${group.status}`)}
                    </h3>
                    <span className="text-xs text-muted-foreground">{group.tasks.length}</span>
                  </div>
                  <div className="grid gap-3">
                    {group.tasks.map((task) => (
                      <button
                        key={task.taskId}
                        type="button"
                        onClick={() => updateQuery({ task: task.taskId })}
                        className="rounded-2xl border border-border/60 bg-card px-4 py-4 text-left"
                      >
                        <p className="text-sm font-semibold text-foreground">{task.title}</p>
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

        <div className="border-t border-border/70 px-6 py-5">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            placeholder={
              activeTab === "chat"
                ? t("conversationView.messagePlaceholder", {
                    name: selectedChannel?.name ?? channelId,
                  })
                : t("conversationView.taskComposerPlaceholder")
            }
            className="rounded-2xl border-border/60 bg-card shadow-none"
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={asTask}
                onChange={(event) => setAsTask(event.target.checked)}
                className="size-4 rounded border-border"
              />
              {t("conversationView.asTask")}
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateQuery({
                    view: taskView === "list" ? "board" : "list",
                    tab: "tasks",
                  })
                }
              >
                {taskView === "list" ? <LayoutGrid className="size-4" /> : <LayoutList className="size-4" />}
                {taskView === "list"
                  ? t("conversationView.boardView")
                  : t("conversationView.listView")}
              </Button>
              <Button type="button" size="sm" onClick={() => void handleSend()} disabled={isSending || !draft.trim()}>
                <Send className="size-4" />
                {t("conversationView.send")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <aside className="hidden w-[25rem] shrink-0 xl:flex xl:flex-col xl:px-5 xl:py-5">
        {contextPanel === "thread" && selectedThreadId ? (
          <ThreadPanel
            thread={threadMessages}
            draft={threadDraft}
            onDraftChange={setThreadDraft}
            onSend={() => void handleSendThreadReply()}
            isSending={isSending}
            onBack={() => updateQuery({ thread: null })}
          />
        ) : contextPanel === "task" && selectedTask ? (
          <TaskPanel
            task={selectedTask}
            activity={taskActivity}
            onBack={() => updateQuery({ task: null })}
          />
        ) : selectedAgent ? (
          <AgentPanel agent={selectedAgent} onOpenDm={handleOpenDm} />
        ) : (
          <div className="rounded-3xl border border-border/70 bg-card p-5">
            <p className="text-sm font-semibold text-foreground">
              {t("conversationView.contextTitle")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("conversationView.contextDescription")}
            </p>
          </div>
        )}
      </aside>
    </main>
  );
}
