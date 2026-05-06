"use client";

import * as React from "react";
import {
  Archive,
  Bot,
  Check,
  ChevronLeft,
  Files,
  Hash,
  Lock,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { FileNode } from "@/features/chat/types";
import { channelTasksApi } from "@/features/channel-tasks/api/channel-tasks-api";
import { resolveChannelTaskView } from "@/features/channel-tasks/lib/channel-task-board";
import type {
  ChannelTask,
  ChannelTaskActivityMessage,
  ChannelTaskView,
} from "@/features/channel-tasks/model/types";
import type { Preset } from "@/features/capabilities/presets/lib/preset-types";
import { serversApi } from "@/features/servers";
import type {
  ServerAgentItem,
  ServerChannelItem,
  ServerChannelMemberItem,
  ServerConversationMessage,
  ServerItem,
  ServerMemberItem,
} from "@/features/servers/model/types";
import { useServerMembership } from "@/features/servers/hooks/use-server-membership";
import {
  buildHumanMentionCandidates,
  getUserDisplayName,
  hasInboxSignal,
  sortMessagesChronologically,
  type MentionCandidate,
} from "@/features/servers/lib/server-conversation-view";
import { shouldShowServerMobileDetail } from "@/features/servers/lib/server-mobile-navigation";
import { AgentPresetDialog } from "@/features/servers/ui/agent-preset-dialog";
import { ChannelTasksWorkspace } from "@/features/servers/ui/channel-tasks-workspace";
import { ColleagueDetail } from "@/features/servers/ui/colleague-detail";
import { ColleaguesPanel } from "@/features/servers/ui/colleagues-panel";
import {
  AgentDrawer,
  ExecutionDrawer,
  SharedArtifactsDrawer,
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
import { ServerAccessDialog } from "@/features/servers/ui/server-access-dialog";
import { ServerWorkspaceSidebar } from "@/features/servers/ui/server-workspace-sidebar";
import type {
  ColleagueSelection,
  DrawerState,
  FeedItem,
  WorkspaceMode,
} from "@/features/servers/ui/server-workspace-types";
import { useUserAccount } from "@/features/user/hooks/use-user-account";
import { useLanguage } from "@/hooks/use-language";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const LAST_SELECTION_KEY = "poco-servers-last-selection-v1";
const SAVED_MESSAGES_KEY = "poco-saved-messages-v1";

function resolveWorkspaceMode(value: string | null): WorkspaceMode | null {
  if (value === "saved") {
    return "inbox";
  }
  if (
    value === "search" ||
    value === "tasks" ||
    value === "colleagues" ||
    value === "inbox"
  ) {
    return value;
  }
  return null;
}

function isDrawerCompatibleWithMode(
  drawer: DrawerState,
  mode: WorkspaceMode,
): boolean {
  if (drawer.type === "none") {
    return true;
  }
  if (mode === "search" || mode === "inbox") {
    return drawer.type === "thread" || drawer.type === "execution";
  }
  if (mode === "tasks") {
    return (
      drawer.type === "task" ||
      drawer.type === "artifacts" ||
      drawer.type === "execution"
    );
  }
  if (mode === "colleagues") {
    return drawer.type === "colleague";
  }
  return (
    drawer.type === "thread" ||
    drawer.type === "execution" ||
    drawer.type === "agent" ||
    drawer.type === "artifacts"
  );
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

function getExplicitMentionHandles(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)@([A-Za-z0-9._-]+)(?=$|[\s,.!?;:])/g)].map(
    (match) => match[1].trim().toLowerCase(),
  );
}

function inferThreadMentionHandle(
  thread: ServerConversationMessage[],
  agents: ServerAgentItem[],
): string | null {
  const agentHandleSet = new Set(
    agents.map((agent) => agent.handle.trim().toLowerCase()),
  );

  for (const message of thread) {
    const contentHandle =
      typeof message.content.agent_handle === "string"
        ? message.content.agent_handle.trim().toLowerCase()
        : "";
    if (contentHandle && agentHandleSet.has(contentHandle)) {
      return contentHandle;
    }

    const text = getMessageText(message);
    for (const handle of getExplicitMentionHandles(text)) {
      if (agentHandleSet.has(handle)) {
        return handle;
      }
    }

    const actorLabel =
      typeof message.content.actor_label === "string"
        ? message.content.actor_label.trim().toLowerCase()
        : "";
    if (actorLabel) {
      const matchedAgent = agents.find(
        (agent) => agent.displayName.trim().toLowerCase() === actorLabel,
      );
      if (matchedAgent) {
        return matchedAgent.handle.trim().toLowerCase();
      }
    }
  }

  return null;
}

function ConversationContent({
  channel,
  agents,
  presets,
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
  onOpenArtifacts,
  onOpenLeaveConfirm,
  onToggleSaved,
  onOpenExecution,
  isSending,
  currentUserId,
}: {
  channel: ServerChannelItem | null;
  agents: ServerAgentItem[];
  presets: Preset[];
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
  onOpenArtifacts: () => void;
  onOpenLeaveConfirm: () => void;
  onToggleSaved: (messageId: string) => void;
  onOpenExecution: (sessionId: string) => void;
  isSending: boolean;
  currentUserId?: string | null;
}) {
  const { t } = useT("translation");
  const Icon = channel?.conversationType === "direct_message" ? Lock : Hash;
  const mentionTrigger = React.useMemo(() => getMentionTrigger(draft), [draft]);
  const mentionCandidates = React.useMemo<MentionCandidate[]>(() => {
    const humans = buildHumanMentionCandidates(members, currentUserId);
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
  }, [agents, currentUserId, mentionTrigger, members]);

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
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenLeaveConfirm}
              disabled={!channel}
            >
              {t("conversationView.leave")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenArtifacts}
              disabled={!channel}
            >
              <Files className="size-4" />
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {isLoading ? (
          <div className="space-y-4 px-6 py-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-md" />
            ))}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                agents={agents}
                presets={presets}
                onOpenThread={() => onOpenThread(message)}
                onOpenExecution={onOpenExecution}
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

function CreateChannelDialog({
  open,
  agents,
  members,
  currentUserId,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  agents: ServerAgentItem[];
  members: ServerMemberItem[];
  currentUserId?: string | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: {
    name: string;
    description: string;
    memberUserIds: string[];
    agentIdentityIds: string[];
  }) => Promise<void>;
}) {
  const { t } = useT("translation");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [memberSearch, setMemberSearch] = React.useState("");
  const [selectedHumanIds, setSelectedHumanIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [selectedAgentIds, setSelectedAgentIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setMemberSearch("");
      setSelectedHumanIds(new Set());
      setSelectedAgentIds(new Set());
      setIsSubmitting(false);
    }
  }, [open]);

  const keyword = memberSearch.trim().toLowerCase();
  const visibleAgents = agents.filter((agent) => {
    if (!keyword) {
      return true;
    }
    return `${agent.displayName} ${agent.handle}`.toLowerCase().includes(keyword);
  });
  const visibleMembers = members
    .filter((member) => member.status === "active" && member.userId !== currentUserId)
    .filter((member) => {
      if (!keyword) {
        return true;
      }
      return `${getUserDisplayName(member.user, member.userId)} ${member.userId}`
        .toLowerCase()
        .includes(keyword);
    });

  const toggleSelected = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onCreate({
        name,
        description,
        memberUserIds: Array.from(selectedHumanIds),
        agentIdentityIds: Array.from(selectedAgentIds),
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-2 border-border p-0 shadow-[var(--shadow-lg)] sm:rounded-md">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader className="border-b border-border px-6 py-5 text-left">
            <DialogTitle className="text-lg font-semibold uppercase tracking-[0.08em]">
              {t("conversationView.createChannel.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                {t("conversationView.createChannel.name")}{" "}
                <span className="text-primary">*</span>
              </label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("conversationView.createChannel.namePlaceholder")}
                className="h-11 rounded-none border-2 border-border bg-background text-base shadow-none"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                {t("conversationView.createChannel.description")}{" "}
                <span className="text-muted-foreground">
                  {t("conversationView.createChannel.optional")}
                </span>
              </label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t(
                  "conversationView.createChannel.descriptionPlaceholder",
                )}
                rows={3}
                className="rounded-none border-2 border-border bg-background text-base shadow-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                {t("conversationView.createChannel.members")}{" "}
                <span className="text-muted-foreground">
                  {t("conversationView.createChannel.optional")}
                </span>
              </label>
              <div className="flex h-11 items-center gap-2 border-2 border-border bg-background px-3">
                <Search className="size-4 text-muted-foreground" />
                <input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder={t(
                    "conversationView.createChannel.memberSearchPlaceholder",
                  )}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="max-h-72 overflow-y-auto border-2 border-border bg-background p-2">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("conversationView.members.agents")}
                </div>
                <div className="space-y-1">
                  {visibleAgents.map((agent) => {
                    const selected = selectedAgentIds.has(agent.id);
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() =>
                          toggleSelected(setSelectedAgentIds, agent.id)
                        }
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                          selected
                            ? "bg-primary/15 text-foreground"
                            : "hover:bg-muted/30",
                        )}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                          <Bot className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {agent.displayName || agent.handle}
                        </span>
                        {selected ? <Check className="size-4 text-primary" /> : null}
                      </button>
                    );
                  })}
                  {visibleAgents.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      {t("conversationView.members.noAgents")}
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("conversationView.members.humans")}
                </div>
                <div className="space-y-1">
                  {visibleMembers.map((member) => {
                    const selected = selectedHumanIds.has(member.userId);
                    return (
                      <button
                        key={member.userId}
                        type="button"
                        onClick={() =>
                          toggleSelected(setSelectedHumanIds, member.userId)
                        }
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                          selected
                            ? "bg-primary/15 text-foreground"
                            : "hover:bg-muted/30",
                        )}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                          <UserRound className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {getUserDisplayName(member.user, member.userId)}
                        </span>
                        {selected ? <Check className="size-4 text-primary" /> : null}
                      </button>
                    );
                  })}
                  {visibleMembers.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      {t("conversationView.members.noHumans")}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 border-t border-border px-6 py-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {t("conversationView.createChannel.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const { profile } = useUserAccount();

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
  const [channelArtifacts, setChannelArtifacts] = React.useState<FileNode[]>([]);
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
  const [isDesktop, setIsDesktop] = React.useState(false);
  const [isMobileDetailVisible, setIsMobileDetailVisible] = React.useState(() =>
    shouldShowServerMobileDetail({
      isDesktop: false,
      channelId,
      modeFromUrl: resolveWorkspaceMode(searchParams.get("mode")),
    }),
  );
  const [taskView, setTaskView] = React.useState<ChannelTaskView>(
    resolveChannelTaskView(searchParams.get("view")),
  );
  const [drawer, setDrawer] = React.useState<DrawerState>({ type: "none" });
  const [desktopDrawerRatio, setDesktopDrawerRatio] = React.useState(50);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [membersOpen, setMembersOpen] = React.useState(false);
  const [serverAccessOpen, setServerAccessOpen] = React.useState(false);
  const [createChannelOpen, setCreateChannelOpen] = React.useState(false);
  const [leaveChannelOpen, setLeaveChannelOpen] = React.useState(false);
  const [agentPresetOpen, setAgentPresetOpen] = React.useState(false);
  const [colleagueDetailClosed, setColleagueDetailClosed] =
    React.useState(false);
  const [isArchivingChannel, setIsArchivingChannel] = React.useState(false);
  const [isLeavingChannel, setIsLeavingChannel] = React.useState(false);

  const switchServer = React.useCallback(
    (nextServerId: string) => {
      setSelectedServerId(nextServerId);
      saveLastSelection({
        mode: "search",
        serverId: nextServerId,
        channelId: null,
      });
      setServerAccessOpen(false);
      router.push(`/${lng}/servers?mode=search&server=${nextServerId}`);
    },
    [lng, router],
  );

  const {
    serverAgents,
    serverMembers,
    serverInvites,
    presets,
    isServerAccessWorking,
    isAgentCreating,
    createServer,
    acceptInvite,
    createInvite,
    copyInvite,
    createAgent,
    removeMember,
  } = useServerMembership({
    selectedServerId,
    onServersChanged: setServers,
    onSwitchServer: switchServer,
    onSelectAgent: (agent) => {
      setDrawer({
        type: "colleague",
        selection: { kind: "agent", id: agent.id },
      });
      setAgentPresetOpen(false);
    },
    onClearSelection: () => setDrawer({ type: "colleague", selection: null }),
  });

  const activeChannelId = channelId ?? null;
  const selectedServer =
    servers.find((server) => server.id === selectedServerId) ?? null;
  const selectedChannel =
    channels.find((channel) => channel.id === activeChannelId) ?? null;
  const topLevelChannels = channels.filter(
    (channel) => channel.conversationType === "channel",
  );
  const directMessages = channels.filter(
    (channel) => channel.conversationType === "direct_message",
  );
  const currentMessages = React.useMemo(
    () =>
      activeChannelId
        ? sortMessagesChronologically(messagesByChannel[activeChannelId] ?? [])
        : [],
    [activeChannelId, messagesByChannel],
  );
  const threadMentionHandle = React.useMemo(
    () => inferThreadMentionHandle(threadMessages, channelAgents),
    [channelAgents, threadMessages],
  );
  const contentAreaRef = React.useRef<HTMLDivElement | null>(null);
  const isResizingDrawerRef = React.useRef(false);
  const hasDesktopDrawer = drawer.type !== "none";
  const selectedTask = React.useMemo(
    () =>
      drawer.type === "task"
        ? (tasks.find((task) => task.taskId === drawer.taskId) ?? null)
        : null,
    [drawer, tasks],
  );
  const feedModeActive = mode === "search" || mode === "inbox";
  const tasksModeActive = Boolean(channelId) && mode === "tasks";
  const colleaguesModeActive = mode === "colleagues";
  const showMobileBack = !isDesktop && isMobileDetailVisible;
  const colleagueSelection = React.useMemo<ColleagueSelection | null>(() => {
    if (drawer.type === "colleague" && drawer.selection) {
      return drawer.selection;
    }
    if (serverAgents[0]) {
      return { kind: "agent", id: serverAgents[0].id };
    }
    if (serverMembers[0]) {
      return { kind: "human", id: serverMembers[0].id };
    }
    return null;
  }, [drawer, serverAgents, serverMembers]);
  const humanCandidates = React.useMemo(
    () => buildHumanMentionCandidates(channelMembers, profile?.id),
    [channelMembers, profile?.id],
  );
  const isChannelOwner = Boolean(
    selectedChannel &&
      profile?.id &&
      (selectedChannel.createdBy === profile.id ||
        channelMembers.some(
          (member) => member.userId === profile.id && member.role === "owner",
        )),
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

  const inboxItems = React.useMemo(
    () =>
      allFeedItems.filter((item) =>
        hasInboxSignal(item.message, profile?.id),
      ),
    [allFeedItems, profile?.id],
  );
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
    if (typeof window === "undefined") {
      return undefined;
    }
    const mediaQuery = window.matchMedia("(min-width: 768px)");

    const updateMatches = (matches: boolean) => {
      setIsDesktop(matches);
      setIsMobileDetailVisible(
        shouldShowServerMobileDetail({
          isDesktop: matches,
          channelId,
          modeFromUrl: resolveWorkspaceMode(searchParams.get("mode")),
        }),
      );
    };

    updateMatches(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      updateMatches(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [channelId, searchParams]);

  React.useEffect(() => {
    const loadServerContext = async () => {
      if (!selectedServerId) {
        setChannels([]);
        setMessagesByChannel({});
        setChannelArtifacts([]);
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
          const [nextTasks, nextAgents, nextMembers, nextArtifacts] = await Promise.all([
            channelTasksApi.listTasks(selectedServerId, activeChannelId),
            serversApi.listChannelAgents(selectedServerId, activeChannelId),
            serversApi.listChannelMembers(selectedServerId, activeChannelId),
            serversApi.listChannelArtifacts(selectedServerId, activeChannelId),
          ]);
          setTasks(nextTasks);
          setChannelAgents(nextAgents);
          setChannelMembers(nextMembers);
          setChannelArtifacts(nextArtifacts);
        } else {
          setTasks([]);
          setChannelAgents([]);
          setChannelMembers([]);
          setChannelArtifacts([]);
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
    if (mode === "colleagues") {
      setColleagueDetailClosed(false);
    }
    setDrawer((current) =>
      isDrawerCompatibleWithMode(current, mode) ? current : { type: "none" },
    );
  }, [mode]);

  React.useEffect(() => {
    if (mode !== "colleagues") {
      return;
    }
    if (colleagueDetailClosed) {
      return;
    }
    if (drawer.type === "colleague" && drawer.selection) {
      return;
    }
    const firstAgent = serverAgents[0];
    const firstMember = serverMembers[0];
    if (firstAgent) {
      setDrawer({
        type: "colleague",
        selection: { kind: "agent", id: firstAgent.id },
      });
    } else if (firstMember) {
      setDrawer({
        type: "colleague",
        selection: { kind: "human", id: firstMember.id },
      });
    }
  }, [colleagueDetailClosed, drawer, mode, serverAgents, serverMembers]);

  React.useEffect(() => {
    const lastSelection = loadLastSelection();
    if (
      !channelId &&
      isDesktop &&
      selectedServerId &&
      lastSelection?.serverId === selectedServerId &&
      (lastSelection.mode === "channel" || lastSelection.mode === "dm") &&
      lastSelection.channelId
    ) {
      router.replace(
        `/${lng}/servers/${selectedServerId}/channels/${lastSelection.channelId}?tab=chat`,
      );
    }
  }, [channelId, isDesktop, lng, router, selectedServerId]);

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
    setIsMobileDetailVisible(true);
    if (nextMode === "colleagues") {
      setColleagueDetailClosed(false);
    }
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
    setIsMobileDetailVisible(true);
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
    setIsMobileDetailVisible(true);
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
      const trimmedDraft = threadDraft.trim();
      const explicitMentions = getExplicitMentionHandles(trimmedDraft);
      const replyText =
        threadMentionHandle && !explicitMentions.includes(threadMentionHandle)
          ? `@${threadMentionHandle} ${trimmedDraft}`
          : trimmedDraft;
      await serversApi.sendMessage(selectedServerId, drawer.channelId, {
        text: replyText,
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

  const handleCreateChannel = async (input: {
    name: string;
    description: string;
    memberUserIds: string[];
    agentIdentityIds: string[];
  }) => {
    if (!selectedServerId) {
      return;
    }
    try {
      const channel = await serversApi.createChannel(selectedServerId, {
        name: input.name.trim(),
        description: input.description.trim() || null,
        memberUserIds: input.memberUserIds,
        agentIdentityIds: input.agentIdentityIds,
      });
      setChannels((current) => [...current, channel]);
      setMessagesByChannel((current) => ({
        ...current,
        [channel.id]: [],
      }));
      toast.success(t("conversationView.toasts.channelCreated"));
      openChannel(channel);
    } catch (error) {
      console.error("[ServersWorkspace] create channel failed", error);
      toast.error(t("conversationView.toasts.channelCreateFailed"));
      throw error;
    }
  };

  const handleLeaveChannel = async () => {
    if (!selectedServerId || !activeChannelId) {
      return;
    }
    setIsLeavingChannel(true);
    try {
      await serversApi.leaveChannel(selectedServerId, activeChannelId);
      setChannels((current) =>
        current.filter((channel) => channel.id !== activeChannelId),
      );
      setMessagesByChannel((current) => {
        const next = { ...current };
        delete next[activeChannelId];
        return next;
      });
      setLeaveChannelOpen(false);
      saveLastSelection({
        mode: "search",
        serverId: selectedServerId,
        channelId: null,
      });
      router.replace(`/${lng}/servers?mode=search&server=${selectedServerId}`);
      toast.success(
        t(
          isChannelOwner
            ? "conversationView.toasts.channelDissolved"
            : "conversationView.toasts.channelLeft",
        ),
      );
    } catch (error) {
      console.error("[ServersWorkspace] leave channel failed", error);
      toast.error(t("conversationView.toasts.channelLeaveFailed"));
    } finally {
      setIsLeavingChannel(false);
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

  const handleMobileBack = () => {
    setIsMobileDetailVisible(false);
    setDrawer({ type: "none" });
    setMode("search");
    const params = new URLSearchParams();
    if (selectedServerId) {
      params.set("server", selectedServerId);
    }
    router.replace(
      `/${lng}/servers${params.toString() ? `?${params.toString()}` : ""}`,
      { scroll: false },
    );
  };

  React.useEffect(() => {
    if (!hasDesktopDrawer) {
      isResizingDrawerRef.current = false;
    }
  }, [hasDesktopDrawer]);

  React.useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!isResizingDrawerRef.current || !contentAreaRef.current) {
        return;
      }

      const rect = contentAreaRef.current.getBoundingClientRect();
      const nextDrawerWidth = rect.right - event.clientX;
      const nextRatio = (nextDrawerWidth / rect.width) * 100;
      const clamped = Math.min(70, Math.max(30, nextRatio));
      setDesktopDrawerRatio(clamped);
    };

    const onPointerUp = () => {
      isResizingDrawerRef.current = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const mobileDetailTitle =
    mode === "conversation"
      ? (selectedChannel?.name ?? t("conversationView.loading"))
      : mode === "tasks"
        ? t("conversationView.tasksTab")
        : mode === "colleagues"
          ? t("conversationView.colleaguesTab")
          : mode === "inbox"
            ? t("conversationView.inbox")
            : t("conversationView.searchInServer");

  const sidebarProps = {
    servers,
    selectedServerId,
    mode,
    inboxCount: inboxItems.length,
    topLevelChannels,
    directMessages,
    activeChannelId,
    onSelectServer: setSelectedServerId,
    onOpenServerAccess: () => setServerAccessOpen(true),
    onOpenMode: openMode,
    onOpenTasks: openTaskMode,
    onOpenChannel: openChannel,
    onCreateChannel: () => setCreateChannelOpen(true),
  };

  return (
    <main className="relative flex h-[calc(100vh-4rem)] min-h-0 flex-1 overflow-hidden border-t border-border bg-background">
      <ServerWorkspaceSidebar {...sidebarProps} />

      {!isMobileDetailVisible ? (
        <div className="flex min-h-0 flex-1 flex-col md:hidden">
          <ServerWorkspaceSidebar {...sidebarProps} variant="mobile" />
        </div>
      ) : null}

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex",
          isMobileDetailVisible ? "flex" : "hidden",
        )}
      >
        {showMobileBack ? (
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              aria-label={t("conversationView.mobile.back")}
              title={t("conversationView.mobile.back")}
              onClick={handleMobileBack}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-foreground">
                {mobileDetailTitle}
              </h1>
              {selectedServer ? (
                <p className="truncate text-sm text-muted-foreground">
                  {selectedServer.name}
                </p>
              ) : null}
            </div>
          </header>
        ) : null}

        <div
          ref={contentAreaRef}
          className="flex min-h-0 flex-1 overflow-hidden"
          style={
            hasDesktopDrawer
              ? ({
                  "--server-drawer-width": `${desktopDrawerRatio}%`,
                } as React.CSSProperties)
              : undefined
          }
        >
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              hasDesktopDrawer &&
                "xl:flex-none xl:w-[calc(100%-var(--server-drawer-width)-2px)]",
            )}
          >
          {feedModeActive ? (
            <section className="flex min-w-0 flex-1 flex-col">
              {mode === "search" ? (
                <SearchPanel
                  search={searchValue}
                  onSearchChange={setSearchValue}
                  items={filteredSearchItems}
                  savedMessageIds={savedMessageIds}
                  currentUserId={profile?.id}
                  onOpenThread={(item) =>
                    setDrawer({
                      type: "thread",
                      channelId: item.channel.id,
                      rootMessageId: item.message.id,
                    })
                  }
                  onOpenExecution={(sessionId) =>
                    setDrawer({ type: "execution", sessionId })
                  }
                  onToggleSaved={toggleSaved}
                />
              ) : (
                <FeedPanel
                  inboxItems={inboxItems}
                  savedItems={savedItems}
                  savedMessageIds={savedMessageIds}
                  currentUserId={profile?.id}
                  onOpenThread={(item) =>
                    setDrawer({
                      type: "thread",
                      channelId: item.channel.id,
                      rootMessageId: item.message.id,
                    })
                  }
                  onOpenExecution={(sessionId) =>
                    setDrawer({ type: "execution", sessionId })
                  }
                  onToggleSaved={toggleSaved}
                />
              )}
            </section>
          ) : colleaguesModeActive ? (
            <ColleaguesPanel
              agents={serverAgents}
              presets={presets}
              members={serverMembers}
              selection={colleagueSelection}
              onSelect={(selection) => {
                setColleagueDetailClosed(false);
                setDrawer({ type: "colleague", selection });
              }}
              onAddAgent={() => setAgentPresetOpen(true)}
              onInviteMember={() => setServerAccessOpen(true)}
            />
          ) : tasksModeActive ? (
            <ChannelTasksWorkspace
              tasks={tasks}
              taskView={taskView}
              activeChannelId={activeChannelId}
              topLevelChannels={topLevelChannels}
              onSelectChannel={(value) => {
                router.push(
                  `/${lng}/servers/${selectedServerId}/channels/${value}?tab=chat&mode=tasks&view=${taskView}`,
                );
              }}
              onUpdateView={updateTaskView}
              onOpenTask={(taskId) => setDrawer({ type: "task", taskId })}
            />
          ) : (
            <ConversationContent
              channel={selectedChannel}
              agents={channelAgents}
              presets={presets}
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
              onOpenArtifacts={() => setDrawer({ type: "artifacts" })}
              onOpenLeaveConfirm={() => setLeaveChannelOpen(true)}
              onToggleSaved={toggleSaved}
              onOpenExecution={(sessionId) =>
                setDrawer({ type: "execution", sessionId })
              }
              isSending={isSending}
              currentUserId={profile?.id}
            />
          )}
          </div>

          {hasDesktopDrawer ? (
            <>
              <div
                className="hidden xl:block xl:w-1 xl:shrink-0 xl:cursor-col-resize xl:bg-border/60 xl:hover:bg-primary/40"
                onPointerDown={(event) => {
                  event.preventDefault();
                  isResizingDrawerRef.current = true;
                }}
              />
              <div
                className="min-w-0 xl:flex xl:h-full xl:flex-none xl:w-[var(--server-drawer-width)]"
              >
                {drawer.type === "thread" ? (
                  <ThreadDrawer
                    thread={threadMessages}
                    agents={channelAgents}
                    presets={presets}
                    draft={threadDraft}
                    suggestedMentionHandle={threadMentionHandle}
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
                ) : drawer.type === "execution" ? (
                  <ExecutionDrawer
                    sessionId={drawer.sessionId}
                    onClose={() => setDrawer({ type: "none" })}
                  />
                ) : drawer.type === "agent" ? (
                  <AgentDrawer
                    agents={channelAgents}
                    presets={presets}
                    selectedAgentId={drawer.agentId}
                    canInspectPersistentFiles={selectedServer?.ownerUserId === profile?.id}
                    onSelectAgent={(id) => setDrawer({ type: "agent", agentId: id })}
                    onClose={() => setDrawer({ type: "none" })}
                    onOpenDm={handleOpenDm}
                  />
                ) : drawer.type === "artifacts" ? (
                  <SharedArtifactsDrawer
                    files={channelArtifacts}
                    isLoading={isLoading}
                    onClose={() => setDrawer({ type: "none" })}
                    fileListLayoutClassName="xl:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)]"
                  />
                ) : drawer.type === "colleague" ? (
                  <ColleagueDetail
                    selection={colleagueSelection}
                    agents={serverAgents}
                    presets={presets}
                    members={serverMembers}
                    serverId={selectedServerId}
                    canInspectPersistentFiles={selectedServer?.ownerUserId === profile?.id}
                    onClose={() => {
                      setColleagueDetailClosed(true);
                      setDrawer({ type: "none" });
                    }}
                    onOpenDm={handleOpenDm}
                    onRemoveMember={(membershipId) => void removeMember(membershipId)}
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <CreateChannelDialog
        open={createChannelOpen}
        agents={serverAgents}
        members={serverMembers}
        currentUserId={profile?.id}
        onOpenChange={setCreateChannelOpen}
        onCreate={handleCreateChannel}
      />
      <AlertDialog open={leaveChannelOpen} onOpenChange={setLeaveChannelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                isChannelOwner
                  ? "conversationView.leaveConfirm.ownerTitle"
                  : "conversationView.leaveConfirm.title",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                isChannelOwner
                  ? "conversationView.leaveConfirm.ownerDescription"
                  : "conversationView.leaveConfirm.description",
                { channel: selectedChannel?.name ?? "" },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLeavingChannel}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleLeaveChannel()}
              disabled={isLeavingChannel || !selectedChannel}
            >
              {t(
                isChannelOwner
                  ? "conversationView.leaveConfirm.dissolve"
                  : "conversationView.leaveConfirm.leave",
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      <ServerAccessDialog
        open={serverAccessOpen}
        server={selectedServer}
        invites={serverInvites}
        isWorking={isServerAccessWorking}
        onOpenChange={setServerAccessOpen}
        onCreateServer={(name) => void createServer(name)}
        onAcceptInvite={(token) => void acceptInvite(token)}
        onCreateInvite={() => void createInvite()}
        onCopyInvite={(token) => void copyInvite(token)}
      />
      <AgentPresetDialog
        open={agentPresetOpen}
        presets={presets}
        isWorking={isAgentCreating}
        onOpenChange={setAgentPresetOpen}
        onCreateAgent={(input) => void createAgent(input)}
      />
    </main>
  );
}
