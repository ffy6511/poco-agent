"use client";

import { MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChannelTask, ChannelTaskActivityMessage } from "@/features/channel-tasks/model/types";
import type { ServerAgentItem, ServerConversationMessage } from "@/features/servers/model/types";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

import { MessageRow } from "./conversation-message-row";

export function ThreadDrawer({
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
    <aside className="hidden w-[24rem] shrink-0 border-l border-border bg-card lg:flex lg:flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div>
          <p className="text-xl font-semibold text-foreground">
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
          className="rounded-md border-border bg-background text-sm shadow-none"
        />
        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" onClick={onSend} disabled={isSending || !draft.trim()}>
            {t("conversationView.send")}
          </Button>
        </div>
      </div>
    </aside>
  );
}

export function AgentDrawer({
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
    <aside className="hidden w-[24rem] shrink-0 border-l border-border bg-card lg:flex lg:flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div>
          <p className="text-xl font-semibold text-foreground">
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
                "w-full rounded-md border px-4 py-4 text-left transition-colors",
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
              <div className="rounded-md border border-border px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("servers.agents.stateRoot")}
                </p>
                <p className="mt-2 break-all text-foreground">
                  {selectedAgent.persistentState?.stateRootPath ??
                    t("servers.agents.emptyValue")}
                </p>
              </div>
              <div className="rounded-md border border-border px-4 py-3">
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

export function TaskDrawer({
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
    <aside className="hidden w-[24rem] shrink-0 border-l border-border bg-card lg:flex lg:flex-col">
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
          <div className="rounded-md border border-border px-4 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("conversationView.taskDetail")}
            </p>
            <p className="mt-2 text-sm leading-7 text-foreground">
              {task.description || t("servers.agents.emptyDescription")}
            </p>
          </div>
          <div className="rounded-md border border-border px-4 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("conversationView.taskActivity")}
            </p>
            <div className="mt-3 space-y-3">
              {activity.length > 0 ? (
                activity.map((item) => (
                  <div key={item.messageId} className="rounded-md border border-border px-3 py-3 text-sm text-foreground">
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
