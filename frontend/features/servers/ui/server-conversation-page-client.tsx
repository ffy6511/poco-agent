"use client";

import * as React from "react";
import {
  Archive,
  Bookmark,
  Bot,
  Hash,
  Inbox,
  LayoutGrid,
  LayoutList,
  Lock,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  ServerChannelMemberItem,
  ServerConversationMessage,
  ServerItem,
} from "@/features/servers/model/types";
import {
  AgentDrawer,
  TaskDrawer,
  ThreadDrawer,
} from "@/features/servers/ui/conversation-drawers";
import {
  getMessageAuthor,
  getMessageText,
  MessageRow,
} from "@/features/servers/ui/conversation-message-row";
import {
  FeedPanel,
  SearchPanel,
} from "@/features/servers/ui/conversation-panels";
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

function resolveWorkspaceMode(value: string | null): WorkspaceMode | null {
  if (
    value === "search" ||
    value === "tasks" ||
    value === "inbox" ||
    value === "saved"
  ) {
    return value;
  }
  return null;
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

type MentionCandidate = {
  id: string;
  label: string;
  handle: string;
  kind: "agent" | "human";
  description?: string | null;
};

function getMentionTrigger(
  value: string,
): { start: number; query: string } | null {
  const match = value.match(/(?:^|\s)@([A-Za-z0-9._-]*)$/);
  if (!match || match.index === undefined) {
    return null;
  }
  return {
    start: match.index + match[0].lastIndexOf("@"),
    query: match[1].toLowerCase(),
  };
}

function buildHumanMentionCandidates(
  members: ServerChannelMemberItem[],
): MentionCandidate[] {
  return members.map((member) => ({
    id: member.userId,
    label: member.userId,
    handle: member.userId,
    kind: "human",
  }));
}

function ConversationContent({
  channel,
  agents,
  members,
  messages,
  savedMessageIds,
  draft,
  asTask,
  isLoading,
  onDraftChange,
  onAsTaskChange,
  onSend,
  onOpenThread,
  onOpenSettings,
  onOpenMembers,
  onToggleSaved,
  isSending,
}: {
  channel: ServerChannelItem | null;
  agents: ServerAgentItem[];
  members: ServerChannelMemberItem[];
  messages: ServerConversationMessage[];
  savedMessageIds: Set<string>;
  draft: string;
  asTask: boolean;
  isLoading: boolean;
  onDraftChange: (value: string) => void;
  onAsTaskChange: (value: boolean) => void;
  onSend: () => void;
  onOpenThread: (message: ServerConversationMessage) => void;
  onOpenSettings: () => void;
  onOpenMembers: () => void;
  onToggleSaved: (messageId: string) => void;
  isSending: boolean;
}) {
  const { t } = useT("translation");
  const Icon = channel?.conversationType === "direct_message" ? Lock : Hash;
  const mentionTrigger = React.useMemo(() => getMentionTrigger(draft), [draft]);
  const mentionCandidates = React.useMemo<MentionCandidate[]>(() => {
    const humans = buildHumanMentionCandidates(members);
    const agentCandidates = agents.map((agent) => ({
      id: agent.id,
      label: agent.displayName,
      handle: agent.handle,
      kind: "agent" as const,
      description: agent.description,
    }));
    const candidates = [...agentCandidates, ...humans];
    if (!mentionTrigger) {
      return [];
    }
    return candidates
      .filter((candidate) => {
        const haystack = `${candidate.label} ${candidate.handle}`.toLowerCase();
        return haystack.includes(mentionTrigger.query);
      })
      .slice(0, 8);
  }, [agents, mentionTrigger, members]);

  const insertMention = (candidate: MentionCandidate) => {
    if (!mentionTrigger) {
      return;
    }
    const mention = `@${candidate.handle} `;
    onDraftChange(
      `${draft.slice(0, mentionTrigger.start)}${mention}${draft.slice(mentionTrigger.start + mentionTrigger.query.length + 1)}`,
    );
  };

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
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
            >
              <Settings2 className="size-4" />
            </Button>
            <Button type="button" variant="outline" size="sm">
              {t("conversationView.leave")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenMembers}
            >
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
                isSaved={savedMessageIds.has(message.id)}
                onToggleSaved={() => onToggleSaved(message.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-6 py-5">
        <div className="relative">
          {mentionTrigger && mentionCandidates.length > 0 ? (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-md rounded-md border border-border bg-popover p-2 shadow-[var(--shadow-lg)]">
              <div className="px-2 pb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {t("conversationView.mentionCandidates")}
              </div>
              <div className="space-y-1">
                {mentionCandidates.map((candidate) => {
                  const CandidateIcon =
                    candidate.kind === "agent" ? Bot : UserRound;
                  return (
                    <button
                      key={`${candidate.kind}-${candidate.id}`}
                      type="button"
                      onClick={() => insertMention(candidate)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/30"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground">
                        <CandidateIcon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {candidate.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{candidate.handle} /{" "}
                          {t(`conversationView.mentionKinds.${candidate.kind}`)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <Textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={4}
            placeholder={t("conversationView.messagePlaceholder", {
              name: channel?.name ?? "",
            })}
            className="rounded-md border-border bg-background text-base shadow-none"
          />
        </div>
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
            <Button
              type="button"
              size="sm"
              onClick={onSend}
              disabled={isSending || !draft.trim()}
            >
              {t("conversationView.send")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChannelSettingsDialog({
  open,
  channel,
  isArchiving,
  onOpenChange,
  onSave,
  onArchive,
  onDelete,
}: {
  open: boolean;
  channel: ServerChannelItem | null;
  isArchiving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { name: string; description: string }) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { t } = useT("translation");
  const [name, setName] = React.useState(channel?.name ?? "");
  const [description, setDescription] = React.useState(
    channel?.description ?? "",
  );

  React.useEffect(() => {
    if (open) {
      setName(channel?.name ?? "");
      setDescription(channel?.description ?? "");
    }
  }, [channel?.description, channel?.name, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("conversationView.channelSettings.title")}
          </DialogTitle>
          <DialogDescription>
            {t("conversationView.channelSettings.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t("conversationView.channelSettings.name")}
            </label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t("conversationView.channelSettings.channelDescription")}
            </label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder={t(
                "conversationView.channelSettings.descriptionPlaceholder",
              )}
              className="rounded-md border-border bg-background shadow-none"
            />
          </div>
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onArchive}
              disabled={isArchiving || !channel}
            >
              <Archive className="size-4" />
              {t("conversationView.channelSettings.archive")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={!channel}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
              {t("conversationView.channelSettings.delete")}
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => onSave({ name, description })}
            disabled={!name.trim()}
          >
            {t("conversationView.channelSettings.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelMembersDialog({
  open,
  channel,
  agents,
  humans,
  onOpenChange,
  onOpenDm,
  onAddMember,
}: {
  open: boolean;
  channel: ServerChannelItem | null;
  agents: ServerAgentItem[];
  humans: MentionCandidate[];
  onOpenChange: (open: boolean) => void;
  onOpenDm: (agentId: string) => void;
  onAddMember: (userId: string) => void;
}) {
  const { t } = useT("translation");
  const [memberUserId, setMemberUserId] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setMemberUserId("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("conversationView.members.title")}</DialogTitle>
          <DialogDescription>
            {t("conversationView.members.description", {
              channel: channel?.name ?? t("conversationView.loading"),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {t("conversationView.members.agents")}
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {agents.length}
              </span>
            </div>
            <div className="space-y-2">
              {agents.length > 0 ? (
                agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onOpenDm(agent.id)}
                    className="flex w-full items-center gap-3 rounded-md border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/20"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground">
                      <Bot className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {agent.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{agent.handle}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                  {t("conversationView.members.noAgents")}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {t("conversationView.members.humans")}
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {humans.length}
              </span>
            </div>
            <div className="space-y-2">
              {humans.length > 0 ? (
                humans.map((human) => (
                  <div
                    key={human.id}
                    className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground">
                      <UserRound className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {human.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{human.handle}
                      </span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                  {t("conversationView.members.noHumans")}
                </div>
              )}
            </div>
          </section>
        </div>
        <DialogFooter>
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Input
              value={memberUserId}
              onChange={(event) => setMemberUserId(event.target.value)}
              placeholder={t("conversationView.members.addMemberPlaceholder")}
            />
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => onAddMember(memberUserId)}
              disabled={!memberUserId.trim()}
            >
              <Plus className="size-4" />
              {t("conversationView.members.addMember")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [channelAgents, setChannelAgents] = React.useState<ServerAgentItem[]>(
    [],
  );
  const [channelMembers, setChannelMembers] = React.useState<
    ServerChannelMemberItem[]
  >([]);
  const [tasks, setTasks] = React.useState<ChannelTask[]>([]);
  const [threadMessages, setThreadMessages] = React.useState<
    ServerConversationMessage[]
  >([]);
  const [taskActivity, setTaskActivity] = React.useState<
    ChannelTaskActivityMessage[]
  >([]);
  const [draft, setDraft] = React.useState("");
  const [threadDraft, setThreadDraft] = React.useState("");
  const [searchValue, setSearchValue] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSending, setIsSending] = React.useState(false);
  const [asTask, setAsTask] = React.useState(false);
  const [savedMessageIds, setSavedMessageIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [mode, setMode] = React.useState<WorkspaceMode>(
    resolveWorkspaceMode(searchParams.get("mode")) ??
      (channelId ? "conversation" : "search"),
  );
  const [taskView, setTaskView] = React.useState<ChannelTaskView>(
    resolveChannelTaskView(searchParams.get("view")),
  );
  const [drawer, setDrawer] = React.useState<DrawerState>({ type: "none" });
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [membersOpen, setMembersOpen] = React.useState(false);
  const [isArchivingChannel, setIsArchivingChannel] = React.useState(false);

  const activeChannelId = channelId ?? null;
  const selectedChannel =
    channels.find((channel) => channel.id === activeChannelId) ?? null;
  const topLevelChannels = channels.filter(
    (channel) => channel.conversationType === "channel",
  );
  const directMessages = channels.filter(
    (channel) => channel.conversationType === "direct_message",
  );
  const currentMessages = React.useMemo(
    () => (activeChannelId ? (messagesByChannel[activeChannelId] ?? []) : []),
    [activeChannelId, messagesByChannel],
  );
  const selectedTask = React.useMemo(
    () =>
      drawer.type === "task"
        ? (tasks.find((task) => task.taskId === drawer.taskId) ?? null)
        : null,
    [drawer, tasks],
  );
  const feedModeActive =
    mode === "search" || mode === "inbox" || mode === "saved";
  const tasksModeActive = Boolean(channelId) && mode === "tasks";
  const humanCandidates = React.useMemo(
    () => buildHumanMentionCandidates(channelMembers),
    [channelMembers],
  );

  const allFeedItems = React.useMemo<FeedItem[]>(() => {
    return channels
      .flatMap((channel) =>
        (messagesByChannel[channel.id] ?? []).map((message) => ({
          channel,
          message,
        })),
      )
      .sort((left, right) => {
        return (
          Date.parse(right.message.createdAt) -
          Date.parse(left.message.createdAt)
        );
      });
  }, [channels, messagesByChannel]);

  const filteredSearchItems = React.useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) {
      return [];
    }
    return allFeedItems.filter((item) => {
      const haystack =
        `${item.channel.name} ${getMessageText(item.message)} ${getMessageAuthor(item.message)}`.toLowerCase();
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

    const routeMode = resolveWorkspaceMode(searchParams.get("mode"));
    if (routeMode) {
      setMode(routeMode);
    } else if (!channelId && lastSelection?.mode) {
      setMode(
        lastSelection.mode === "channel" || lastSelection.mode === "dm"
          ? "search"
          : (lastSelection.mode as WorkspaceMode),
      );
    } else if (!channelId) {
      setMode("search");
    } else {
      setMode("conversation");
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
            const messages = await serversApi.listMessages(
              selectedServerId,
              channel.id,
            );
            return [channel.id, messages] as const;
          }),
        );
        setMessagesByChannel(Object.fromEntries(previews));

        if (activeChannelId) {
          const [nextTasks, nextAgents, nextMembers] = await Promise.all([
            channelTasksApi.listTasks(selectedServerId, activeChannelId),
            serversApi.listChannelAgents(selectedServerId, activeChannelId),
            serversApi.listChannelMembers(selectedServerId, activeChannelId),
          ]);
          setTasks(nextTasks);
          setChannelAgents(nextAgents);
          setChannelMembers(nextMembers);
        } else {
          setTasks([]);
          setChannelAgents([]);
          setChannelMembers([]);
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
      if (
        !selectedServerId ||
        !activeChannelId ||
        !selectedTask?.threadRootMessageId
      ) {
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
    if (nextMode === "conversation" || !selectedServerId) {
      return;
    }
    saveLastSelection({
      mode: nextMode,
      serverId: selectedServerId,
      channelId: null,
    });
    const targetUrl = activeChannelId
      ? `/${lng}/servers/${selectedServerId}/channels/${activeChannelId}?tab=chat&mode=${nextMode}`
      : `/${lng}/servers?mode=${nextMode}&server=${selectedServerId}`;
    router.replace(targetUrl, { scroll: false });
  };

  const openTaskMode = () => {
    if (!selectedServerId) {
      return;
    }
    const targetChannelId =
      activeChannelId ??
      selectedChannel?.id ??
      topLevelChannels[0]?.id ??
      channels[0]?.id ??
      null;
    if (!targetChannelId) {
      setMode("tasks");
      return;
    }
    setMode("tasks");
    saveLastSelection({
      mode: "tasks",
      serverId: selectedServerId,
      channelId: targetChannelId,
    });
    router.replace(
      `/${lng}/servers/${selectedServerId}/channels/${targetChannelId}?tab=chat&mode=tasks&view=${taskView}`,
      { scroll: false },
    );
  };

  const updateTaskView = (nextView: ChannelTaskView) => {
    setTaskView(nextView);
    if (!selectedServerId || !activeChannelId) {
      return;
    }
    router.replace(
      `/${lng}/servers/${selectedServerId}/channels/${activeChannelId}?tab=chat&mode=tasks&view=${nextView}`,
      { scroll: false },
    );
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
    router.push(
      `/${lng}/servers/${selectedServerId}/channels/${channel.id}?tab=chat`,
    );
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
      const messages = await serversApi.listMessages(
        selectedServerId,
        activeChannelId,
      );
      setMessagesByChannel((current) => ({
        ...current,
        [activeChannelId]: messages,
      }));
      if (asTask) {
        setTasks(
          await channelTasksApi.listTasks(selectedServerId, activeChannelId),
        );
      }
    } catch (error) {
      console.error("[ServersWorkspace] send failed", error);
      toast.error(t("conversationView.toasts.sendFailed"));
    } finally {
      setIsSending(false);
    }
  };

  const handleReply = async () => {
    if (drawer.type !== "thread" || !selectedServerId || !threadDraft.trim()) {
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
        serversApi.getThread(
          selectedServerId,
          drawer.channelId,
          drawer.rootMessageId,
        ),
      ]);
      setMessagesByChannel((current) => ({
        ...current,
        [drawer.channelId]: messages,
      }));
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

  const handleArchiveChannel = async () => {
    if (!selectedServerId || !activeChannelId) {
      return;
    }
    setIsArchivingChannel(true);
    try {
      const archived = await serversApi.archiveChannel(
        selectedServerId,
        activeChannelId,
      );
      setChannels((current) =>
        current.map((channel) =>
          channel.id === archived.id ? archived : channel,
        ),
      );
      setSettingsOpen(false);
      toast.success(t("conversationView.toasts.channelArchived"));
    } catch (error) {
      console.error("[ServersWorkspace] archive channel failed", error);
      toast.error(t("conversationView.toasts.channelArchiveFailed"));
    } finally {
      setIsArchivingChannel(false);
    }
  };

  const handleUpdateChannel = async (input: {
    name: string;
    description: string;
  }) => {
    if (!selectedServerId || !activeChannelId) {
      return;
    }
    try {
      const updated = await serversApi.updateChannel(
        selectedServerId,
        activeChannelId,
        {
          name: input.name.trim(),
          description: input.description.trim(),
        },
      );
      setChannels((current) =>
        current.map((channel) =>
          channel.id === updated.id ? updated : channel,
        ),
      );
      setSettingsOpen(false);
      toast.success(t("conversationView.toasts.channelUpdated"));
    } catch (error) {
      console.error("[ServersWorkspace] update channel failed", error);
      toast.error(t("conversationView.toasts.channelUpdateFailed"));
    }
  };

  const handleDeleteChannel = async () => {
    if (!selectedServerId || !activeChannelId) {
      return;
    }
    try {
      await serversApi.deleteChannel(selectedServerId, activeChannelId);
      setChannels((current) =>
        current.filter((channel) => channel.id !== activeChannelId),
      );
      setSettingsOpen(false);
      saveLastSelection({
        mode: "search",
        serverId: selectedServerId,
        channelId: null,
      });
      router.replace(`/${lng}/servers?mode=search&server=${selectedServerId}`);
      toast.success(t("conversationView.toasts.channelDeleted"));
    } catch (error) {
      console.error("[ServersWorkspace] delete channel failed", error);
      toast.error(t("conversationView.toasts.channelDeleteFailed"));
    }
  };

  const handleAddChannelMember = async (userId: string) => {
    if (!selectedServerId || !activeChannelId) {
      return;
    }
    try {
      const member = await serversApi.addChannelMember(
        selectedServerId,
        activeChannelId,
        {
          userId: userId.trim(),
        },
      );
      setChannelMembers((current) => {
        const withoutExisting = current.filter((item) => item.id !== member.id);
        return [...withoutExisting, member];
      });
      toast.success(t("conversationView.toasts.memberAdded"));
    } catch (error) {
      console.error("[ServersWorkspace] add channel member failed", error);
      toast.error(t("conversationView.toasts.memberAddFailed"));
    }
  };

  return (
    <main className="relative flex h-[calc(100vh-4rem)] min-h-0 flex-1 overflow-hidden border-t border-border bg-background">
      <aside className="hidden w-[17rem] shrink-0 border-r border-border bg-card md:flex md:flex-col lg:w-[18rem]">
        <div className="border-b border-border px-4 py-4">
          <div>
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="space-y-1">
            {(
              [
                ["searchInServer", Search, "search"],
                ["tasksTab", LayoutGrid, "tasks"],
                ["inbox", Inbox, "inbox"],
                ["saved", Bookmark, "saved"],
              ] as const
            ).map(([key, Icon, nextMode]) => {
              const isActive = mode === nextMode;
              return (
                <button
                  key={nextMode}
                  type="button"
                  onClick={() => {
                    if (nextMode === "tasks") {
                      openTaskMode();
                      return;
                    }
                    openMode(nextMode as WorkspaceMode);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors",
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
                    <span className="text-sm text-muted-foreground">
                      {inboxItems.length}
                    </span>
                  ) : nextMode === "saved" ? (
                    <span className="text-sm text-muted-foreground">
                      {savedItems.length}
                    </span>
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
              <span className="text-xs text-muted-foreground">
                {directMessages.length}
              </span>
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

      {feedModeActive ? (
        <section className="flex min-w-0 flex-1 flex-col">
          {mode === "search" ? (
            <SearchPanel
              search={searchValue}
              onSearchChange={setSearchValue}
              items={filteredSearchItems}
              savedMessageIds={savedMessageIds}
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
              savedMessageIds={savedMessageIds}
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
              savedMessageIds={savedMessageIds}
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
      ) : tasksModeActive ? (
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
            <Select
              value={activeChannelId ?? ""}
              onValueChange={(value) => {
                router.push(
                  `/${lng}/servers/${selectedServerId}/channels/${value}?tab=chat&mode=tasks&view=${taskView}`,
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
            <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
              <Button
                type="button"
                variant={taskView === "board" ? "default" : "ghost"}
                size="sm"
                onClick={() => updateTaskView("board")}
              >
                <LayoutGrid className="size-4" />
                {t("conversationView.boardView")}
              </Button>
              <Button
                type="button"
                variant={taskView === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => updateTaskView("list")}
              >
                <LayoutList className="size-4" />
                {t("conversationView.listView")}
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {taskView === "board" ? (
              <div className="overflow-x-auto">
                <div className="grid min-w-[980px] grid-cols-4 gap-4">
                  {buildChannelTaskColumns(tasks).map((column) => (
                    <section
                      key={column.status}
                      className="flex min-h-[32rem] flex-col rounded-md border border-border bg-muted/10 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3 px-1">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-foreground">
                            {t(`channelTasks.statuses.${column.status}`)}
                          </span>
                        </div>
                        <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                          {column.tasks.length}
                        </span>
                      </div>
                      <div className="min-h-0 flex-1 space-y-3">
                        {column.tasks.length > 0 ? (
                          column.tasks.map((task) => (
                            <button
                              key={task.taskId}
                              type="button"
                              onClick={() =>
                                setDrawer({ type: "task", taskId: task.taskId })
                              }
                              className="w-full rounded-md border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-muted/20"
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
                          <div className="flex min-h-32 items-center rounded-md border border-dashed border-border bg-background/70 px-4 py-10 text-sm text-muted-foreground">
                            {t("conversationView.emptyTaskColumn", {
                              status: t(
                                `channelTasks.statuses.${column.status}`,
                              ),
                            })}
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : buildChannelTaskListGroups(tasks).length > 0 ? (
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
                          onClick={() =>
                            setDrawer({ type: "task", taskId: task.taskId })
                          }
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
            ) : (
              <div className="flex min-h-[28rem] items-center justify-center rounded-md border border-dashed border-border bg-muted/10 px-6 py-12 text-center">
                <div className="max-w-sm space-y-2">
                  <LayoutList className="mx-auto size-8 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">
                    {t("conversationView.emptyTaskListTitle")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("conversationView.emptyTaskListDescription")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <ConversationContent
          channel={selectedChannel}
          agents={channelAgents}
          members={channelMembers}
          messages={currentMessages}
          savedMessageIds={savedMessageIds}
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
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenMembers={() => setMembersOpen(true)}
          onToggleSaved={toggleSaved}
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

      <ChannelSettingsDialog
        open={settingsOpen}
        channel={selectedChannel}
        isArchiving={isArchivingChannel}
        onOpenChange={setSettingsOpen}
        onSave={(input) => void handleUpdateChannel(input)}
        onArchive={() => void handleArchiveChannel()}
        onDelete={() => void handleDeleteChannel()}
      />
      <ChannelMembersDialog
        open={membersOpen}
        channel={selectedChannel}
        agents={channelAgents}
        humans={humanCandidates}
        onOpenChange={setMembersOpen}
        onOpenDm={(agentId) => {
          setMembersOpen(false);
          void handleOpenDm(agentId);
        }}
        onAddMember={(userId) => void handleAddChannelMember(userId)}
      />
    </main>
  );
}
