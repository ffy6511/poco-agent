"use client";

import { ArrowLeft, Info, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Preset } from "@/features/capabilities/presets/lib/preset-types";
import type {
  ChannelTask,
  ChannelTaskActivityMessage,
} from "@/features/channel-tasks/model/types";
import type {
  ServerAgentItem,
  ServerConversationMessage,
} from "@/features/servers/model/types";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { SharedArtifactsDrawer } from "@/features/servers/ui/shared-artifacts-drawer";

import { MessageRow } from "./conversation-message-row";
import {
  getAgentRuntimeDotClassName,
  getAgentRuntimeStatus,
} from "../lib/agent-runtime-status";
import { ServerMessageContent } from "./server-message-content";
import { ServerAgentAvatar } from "./server-agent-avatar";

const overlayDrawerClassName =
  "absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-card md:left-[17rem] md:w-auto lg:left-[18rem] xl:static xl:h-full xl:w-full xl:min-w-0 xl:shrink-0";

export function ThreadDrawer({
  thread,
  agents,
  presets,
  draft,
  suggestedMentionHandle,
  onDraftChange,
  onSend,
  onClose,
  isSending,
}: {
  thread: ServerConversationMessage[];
  agents: ServerAgentItem[];
  presets: Preset[];
  draft: string;
  suggestedMentionHandle?: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
  isSending: boolean;
}) {
  const { t } = useT("translation");
  return (
    <aside className={overlayDrawerClassName}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("conversationView.backToContext")}
            className="shrink-0 xl:hidden"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <p className="text-xl font-semibold text-foreground">
            {t("conversationView.threadTitle")}
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
            agents={agents}
            presets={presets}
            onOpenThread={() => undefined}
            onToggleSaved={() => undefined}
          />
        ))}
      </div>
      <div className="border-t border-border px-6 py-5">
        {suggestedMentionHandle ? (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0 text-muted-foreground" />
            <span>
              {t("conversationView.threadMentionHint")}{" "}
              <span className="font-medium text-foreground">
                @{suggestedMentionHandle}
              </span>
            </span>
          </div>
        ) : null}
        <Textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          rows={6}
          placeholder={t("conversationView.threadPlaceholder")}
          className="rounded-md border-border bg-background text-sm shadow-none"
        />
        <div className="mt-4 flex justify-end">
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
    </aside>
  );
}

export function AgentDrawer({
  agents,
  presets,
  selectedAgentId,
  canInspectPersistentFiles,
  onSelectAgent,
  onClose,
  onOpenDm,
}: {
  agents: ServerAgentItem[];
  presets: Preset[];
  selectedAgentId: string | null | undefined;
  canInspectPersistentFiles?: boolean;
  onSelectAgent: (id: string) => void;
  onClose: () => void;
  onOpenDm: (agentId: string) => void;
}) {
  const { t } = useT("translation");
  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  const selectedRuntimeStatus = selectedAgent
    ? getAgentRuntimeStatus(selectedAgent)
    : null;
  return (
    <aside className={overlayDrawerClassName}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("conversationView.backToContext")}
            className="shrink-0 xl:hidden"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <p className="text-xl font-semibold text-foreground">
            {t("servers.agents.title")}
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
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-foreground">
                  {agent.displayName}
                </p>
                {(() => {
                  const runtimeStatus = getAgentRuntimeStatus(agent);
                  return (
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          getAgentRuntimeDotClassName(runtimeStatus.tone),
                        )}
                      />
                      {t(runtimeStatus.labelKey)}
                    </span>
                  );
                })()}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                @{agent.handle}
              </p>
            </button>
          ))}
        </div>
        {selectedAgent ? (
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            <div className="flex items-start gap-4">
              <ServerAgentAvatar
                agent={selectedAgent}
                presets={presets}
                className="size-14 shrink-0"
                fallbackClassName="text-lg"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <p className="text-lg font-semibold text-foreground">
                    {selectedAgent.displayName}
                  </p>
                  {selectedRuntimeStatus ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          getAgentRuntimeDotClassName(selectedRuntimeStatus.tone),
                        )}
                      />
                      {t(selectedRuntimeStatus.labelKey)}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  @{selectedAgent.handle}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedAgent.description ||
                    t("conversationView.colleagues.agentEmptyDescription")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {selectedAgent.persistentState?.runtimeStatus ??
                  t("servers.agents.unknown")}
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
            {canInspectPersistentFiles && selectedAgent.persistentState ? (
              <div className="space-y-3 rounded-md border border-border bg-background px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("conversationView.colleagues.persistentFiles")}
                </p>
                <PathItem
                  label={t("conversationView.colleagues.profilePath")}
                  value={selectedAgent.persistentState.profilePath}
                />
                <PathItem
                  label={t("conversationView.colleagues.notesPath")}
                  value={selectedAgent.persistentState.notesDirPath}
                />
                <PathItem
                  label={t("conversationView.colleagues.statePath")}
                  value={selectedAgent.persistentState.stateDirPath}
                />
                <PathItem
                  label={t("conversationView.colleagues.artifactsPath")}
                  value={selectedAgent.persistentState.artifactsDirPath}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenDm(selectedAgent.id)}
              >
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

function PathItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 break-all text-sm text-foreground">{value}</p>
    </div>
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
    <aside className={overlayDrawerClassName}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("conversationView.backToContext")}
            className="shrink-0 xl:hidden"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <p className="text-xl font-semibold text-foreground">{task.title}</p>
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
                  <div
                    key={item.messageId}
                    className="rounded-md border border-border px-3 py-3 text-sm text-foreground"
                  >
                    <ServerMessageContent
                      content={item.textPreview || t("conversationView.emptyMessage")}
                    />
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

export { SharedArtifactsDrawer };
