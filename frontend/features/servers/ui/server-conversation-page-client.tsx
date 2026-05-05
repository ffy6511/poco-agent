"use client";

import * as React from "react";
import {
  Bookmark,
  Hash,
  Inbox,
  LayoutGrid,
  LayoutList,
  Lock,
  MessageSquare,
  Search,
  Settings2,
  Square,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

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
  ChannelTaskView,
} from "@/features/channel-tasks/model/types";
import { serversApi } from "@/features/servers";
import type {
  ServerAgentItem,
  ServerChannelItem,
  ServerConversationMessage,
  ServerItem,
} from "@/features/servers/model/types";
import { AgentDrawer, TaskDrawer, ThreadDrawer } from "@/features/servers/ui/conversation-drawers";
import {
  getMessageAuthor,
  getMessageText,
  MessageRow,
} from "@/features/servers/ui/conversation-message-row";
import { FeedPanel, SearchPanel } from "@/features/servers/ui/conversation-panels";
import type {
  DrawerState,
  FeedItem,
  WorkspaceMode,
} from "@/features/servers/ui/server-workspace-types";
import { useLanguage } from "@/hooks/use-language";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const LAST_SELECTION_KEY = "poco-servers-last-selection-v1";
const SAVED_MESSAGES_KEY = "poco-saved-messages-v1";

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

function ConversationContent({
  channel,
  server,
  agents,
  messages,
  draft,
  asTask,
  isLoading,
  onDraftChange,
  onAsTaskChange,
  onSend,
  onOpenThread,
  onOpenAgents,
  isSending,
}: {
  channel: ServerChannelItem | null;
  server: ServerItem | null;
  agents: ServerAgentItem[];
  messages: ServerConversationMessage[];
  draft: string;
  asTask: boolean;
  isLoading: boolean;
  onDraftChange: (value: string) => void;
  onAsTaskChange: (value: boolean) => void;
  onSend: () => void;
  onOpenThread: (message: ServerConversationMessage) => void;
  onOpenAgents: () => void;
  isSending: boolean;
}) {
  const { t } = useT("translation");
  const Icon = channel?.conversationType === "direct_message" ? Lock : Hash;

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-primary/15 text-foreground">
              <Icon className="size-6" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-semibold text-foreground">
                {channel?.name ?? t("conversationView.loading")}
              </h2>
              <p className="truncate text-base text-muted-foreground">
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

      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        {isLoading ? (
          <div className="space-y-4 px-6 py-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-md" />
            ))}
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                onOpenThread={() => onOpenThread(message)}
                onToggleSaved={() => undefined}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-6 py-5">
        <Textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          rows={4}
          placeholder={t("conversationView.messagePlaceholder", { name: channel?.name ?? "" })}
          className="rounded-md border-border bg-background text-base shadow-none"
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-3 text-base text-foreground">
            <input
              type="checkbox"
              checked={asTask}
              onChange={(event) => onAsTaskChange(event.target.checked)}
              className="size-5 rounded-none border-foreground"
            />
            {t("conversationView.asTask")}
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={onSend} disabled={isSending || !draft.trim()}>
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
    channelId
      ? (searchParams.get("mode") === "tasks" ? "tasks" : "conversation")
      : "search",
  );
  const [taskView, setTaskView] = React.useState<ChannelTaskView>(
    resolveChannelTaskView(searchParams.get("view")),
  );
  const [drawer, setDrawer] = React.useState<DrawerState>({ type: "none" });

  const selectedServer =
    servers.find((server) => server.id === selectedServerId) ?? null;
  const activeChannelId = channelId ?? null;
  const selectedChannel =
    channels.find((channel) => channel.id === activeChannelId) ?? null;
  const topLevelChannels = channels.filter(
    (channel) => channel.conversationType === "channel",
  );
  const directMessages = channels.filter(
    (channel) => channel.conversationType === "direct_message",
  );
  const currentMessages = activeChannelId
    ? (messagesByChannel[activeChannelId] ?? [])
    : [];
  const selectedTask = React.useMemo(
    () =>
      drawer.type === "task"
        ? tasks.find((task) => task.taskId === drawer.taskId) ?? null
        : null,
    [drawer, tasks],
  );
  const tasksModeActive = Boolean(channelId) && mode === "tasks";

  const allFeedItems = React.useMemo<FeedItem[]>(() => {
    return channels
      .flatMap((channel) =>
        (messagesByChannel[channel.id] ?? []).map((message) => ({
          channel,
          message,
        })),
      )
      .sort((left, right) => {
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
      requestedServerId || lastSelection?.serverId || nextServers[0]?.id || null;
    setSelectedServerId(preferredServerId);

    if (!channelId && lastSelection?.mode && !searchParams.get("mode")) {
      setMode(
        lastSelection.mode === "channel" || lastSelection.mode === "dm"
          ? "search"
          : (lastSelection.mode as WorkspaceMode),
      );
    } else if (!channelId) {
      const routeMode = searchParams.get("mode");
      if (
        routeMode === "search" ||
        routeMode === "inbox" ||
        routeMode === "saved" ||
        routeMode === "tasks"
      ) {
        setMode(routeMode);
      }
    } else {
      setMode(searchParams.get("mode") === "tasks" ? "tasks" : "conversation");
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
        const title =
          content.split("\n")[0]?.trim().slice(0, 80) || content.slice(0, 80);
        await channelTasksApi.createTask(selectedServerId, activeChannelId, {
          title,
          description: content,
        });
        setMode("tasks");
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
    <main className="flex h-[calc(100vh-4rem)] min-h-0 flex-1 overflow-hidden border-t border-border bg-background">
      <aside className="hidden w-[17rem] shrink-0 border-r border-border bg-card md:flex md:flex-col lg:w-[18rem]">
        <div className="border-b border-border px-4 py-4">
          <p className="text-xl font-semibold text-foreground">
            {t("conversationView.title")}
          </p>
          <div className="mt-3">
            <Select
              value={selectedServerId ?? ""}
              onValueChange={(value) => setSelectedServerId(value)}
            >
              <SelectTrigger className="w-full border-border bg-background text-sm">
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="space-y-0">
            {([
              ["searchInServer", Search, "search"],
              ["tasksTab", LayoutGrid, "tasks"],
              ["inbox", Inbox, "inbox"],
              ["saved", Bookmark, "saved"],
            ] as const).map(([key, Icon, nextMode]) => {
              const isActive = mode === nextMode;
              return (
                <button
                  key={nextMode}
                  type="button"
                  onClick={() => {
                    setMode(nextMode as WorkspaceMode);
                    setDrawer({ type: "none" });
                    if (!selectedServerId) {
                      return;
                    }
                    if (channelId) {
                      router.replace(
                        `/${lng}/servers/${selectedServerId}/channels/${channelId}?tab=chat${nextMode === "tasks" ? "&mode=tasks" : ""}`,
                        { scroll: false },
                      );
                    } else {
                      openMode(nextMode as WorkspaceMode);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-3 text-left transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-foreground hover:bg-muted/20",
                  )}
                >
                  <span className="flex items-center gap-3 text-sm">
                    <Icon className="size-5" />
                    {t(`conversationView.${key}`)}
                  </span>
                  {nextMode === "inbox" ? (
                    <span className="text-sm text-muted-foreground">{inboxItems.length}</span>
                  ) : nextMode === "saved" ? (
                    <span className="text-sm text-muted-foreground">{savedItems.length}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                    "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors",
                    channel.id === activeChannelId
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-transparent bg-transparent text-foreground hover:bg-muted/20",
                  )}
                >
                  <Hash className="size-5" />
                  <span className="truncate text-sm">{channel.name}</span>
                </button>
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
              {directMessages.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => openChannel(channel)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors",
                    channel.id === activeChannelId
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-transparent bg-transparent text-foreground hover:bg-muted/20",
                  )}
                >
                  <MessageSquare className="size-5" />
                  <span className="truncate text-sm">{channel.name}</span>
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
              onToggleSaved={toggleSaved}
            />
          ) : mode === "saved" ? (
            <FeedPanel
              mode="saved"
              items={savedItems}
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
        tasksModeActive ? (
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-border px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-md border border-border bg-primary/15 text-foreground">
                    <LayoutGrid className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground">
                      {t("conversationView.tasksTab")}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {tasks.length} {t("conversationView.channelTasksLabel")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={taskView === "board" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTaskView("board")}
                  >
                    <LayoutGrid className="size-4" />
                    {t("conversationView.boardView")}
                  </Button>
                  <Button
                    type="button"
                    variant={taskView === "list" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTaskView("list")}
                  >
                    <LayoutList className="size-4" />
                    {t("conversationView.listView")}
                  </Button>
                </div>
              </div>
            </div>
            <div className="border-b border-border px-6 py-5">
              <Select
                value={activeChannelId ?? ""}
                onValueChange={(value) => {
                  router.push(
                    `/${lng}/servers/${selectedServerId}/channels/${value}?tab=chat&mode=tasks`,
                  );
                }}
              >
                <SelectTrigger className="w-fit min-w-[180px] border-border bg-background text-sm">
                  <SelectValue placeholder={t("conversationView.channels")} />
                </SelectTrigger>
                <SelectContent>
                  {topLevelChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {taskView === "board" ? (
                <div className="grid gap-4 xl:grid-cols-4">
                  {buildChannelTaskColumns(tasks).map((column) => (
                    <section
                      key={column.status}
                      className="rounded-md border border-border bg-card p-3"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="rounded-sm bg-primary/15 px-2 py-1 text-xs font-semibold uppercase text-foreground">
                            {t(`channelTasks.statuses.${column.status}`)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {column.tasks.length}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {column.tasks.length > 0 ? (
                          column.tasks.map((task) => (
                            <button
                              key={task.taskId}
                              type="button"
                              onClick={() => setDrawer({ type: "task", taskId: task.taskId })}
                              className="w-full rounded-md border border-border bg-background px-4 py-4 text-left"
                            >
                              <p className="text-xs font-medium text-muted-foreground">
                                #{task.taskId.slice(0, 4)}
                              </p>
                              <p className="mt-2 text-base font-semibold text-foreground">
                                {task.title}
                              </p>
                              {task.description ? (
                                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                                  {task.description}
                                </p>
                              ) : null}
                            </button>
                          ))
                        ) : (
                          <div className="rounded-md border border-dashed border-border px-4 py-10 text-sm text-muted-foreground">
                            {t("conversationView.emptyTaskColumn", {
                              status: t(`channelTasks.statuses.${column.status}`),
                            })}
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {buildChannelTaskListGroups(tasks).map((group) => (
                    <section key={group.status} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="rounded-sm bg-primary/15 px-2 py-1 text-xs font-semibold uppercase text-foreground">
                          {t(`channelTasks.statuses.${group.status}`)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {group.tasks.length}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {group.tasks.map((task) => (
                          <button
                            key={task.taskId}
                            type="button"
                            onClick={() => setDrawer({ type: "task", taskId: task.taskId })}
                            className="w-full rounded-md border border-border bg-card px-4 py-4 text-left hover:bg-muted/20"
                          >
                            <p className="text-base font-semibold text-foreground">
                              {task.title}
                            </p>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : (
        <ConversationContent
          channel={selectedChannel}
          server={selectedServer}
          agents={channelAgents}
          messages={currentMessages}
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
          isSending={isSending}
        />
        )
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
