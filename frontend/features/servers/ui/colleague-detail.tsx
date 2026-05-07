"use client";

import * as React from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clipboard,
  MessageSquare,
  Shield,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Preset } from "@/features/capabilities/presets/lib/preset-types";
import { serversApi } from "@/features/servers";
import type { FileNode } from "@/features/chat/types";
import {
  getUserAvatarUrl,
  getUserDisplayName,
} from "@/features/servers/lib/server-conversation-view";
import {
  getAgentRuntimeDotClassName,
  getAgentRuntimeStatus,
} from "@/features/servers/lib/agent-runtime-status";
import type {
  ServerAgentItem,
  ServerMemberItem,
} from "@/features/servers/model/types";
import type { ColleagueSelection } from "@/features/servers/ui/server-workspace-types";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ServerAgentAvatar } from "./server-agent-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AgentPersistentFilesPanel } from "./agent-persistent-files-panel";

export function ColleagueDetail({
  selection,
  agents,
  presets,
  members,
  serverId,
  canInspectPersistentFiles,
  activeChannelIdByAgentId = {},
  onClose,
  onOpenDm,
  onOpenActiveChannel,
  onRemoveMember,
}: {
  selection: ColleagueSelection | null;
  agents: ServerAgentItem[];
  presets: Preset[];
  members: ServerMemberItem[];
  serverId?: string | null;
  canInspectPersistentFiles?: boolean;
  activeChannelIdByAgentId?: Record<string, string>;
  onClose: () => void;
  onOpenDm: (agentId: string) => void;
  onOpenActiveChannel?: (channelId: string) => void;
  onRemoveMember: (membershipId: number) => void;
}) {
  const { t } = useT("translation");
  const selectedAgent =
    selection?.kind === "agent"
      ? (agents.find((agent) => agent.id === selection.id) ?? null)
      : null;
  const selectedMember =
    selection?.kind === "human"
      ? (members.find((member) => member.id === selection.id) ?? null)
      : null;
  const selectedRuntimeStatus = selectedAgent
    ? getAgentRuntimeStatus(selectedAgent)
    : null;
  const selectedAgentActiveChannelId = selectedAgent
    ? (activeChannelIdByAgentId[selectedAgent.id] ?? "")
    : "";
  const [persistentFiles, setPersistentFiles] = React.useState<FileNode[]>([]);
  const [isLoadingPersistentFiles, setIsLoadingPersistentFiles] =
    React.useState(false);

  React.useEffect(() => {
    if (!canInspectPersistentFiles || !serverId || !selectedAgent) {
      setPersistentFiles([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setIsLoadingPersistentFiles(true);
        const files = await serversApi.listAgentStateFiles(serverId, selectedAgent.id);
        if (!cancelled) {
          setPersistentFiles(files);
        }
      } catch (error) {
        console.error("[ColleagueDetail] failed to load persistent files", error);
        if (!cancelled) {
          setPersistentFiles([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPersistentFiles(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [canInspectPersistentFiles, selectedAgent, serverId]);

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-card md:left-[17rem] md:w-auto lg:left-[18rem] xl:static xl:h-full xl:w-full xl:min-w-0 xl:shrink-0">
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
          <p className="text-base font-semibold text-foreground">
            {t("conversationView.colleagues.detailTitle")}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("conversationView.close")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedAgent ? (
          <div className="space-y-5 px-6 py-6">
            <div className="flex items-start gap-4">
              <ServerAgentAvatar
                agent={selectedAgent}
                presets={presets}
                className="size-14 shrink-0"
                fallbackClassName="text-lg"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="truncate text-lg font-semibold text-foreground">
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
                <p className="mt-1 text-sm text-muted-foreground">
                  @{selectedAgent.handle}
                </p>
              </div>
            </div>
            <div className="rounded-md border border-border bg-background px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("conversationView.colleagues.description")}
              </p>
              <p className="mt-3 text-sm leading-6 text-foreground">
                {selectedAgent.description ||
                  t("conversationView.colleagues.agentEmptyDescription")}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoTile
                icon={<Shield className="size-4" />}
                label={t("conversationView.colleagues.lifecycle")}
                value={selectedAgent.lifecycleState}
              />
              <InfoTile
                icon={<Clipboard className="size-4" />}
                label={t("servers.agents.preset", {
                  id: selectedAgent.presetId,
                })}
                value={selectedAgent.visualKey}
              />
            </div>
            <InfoTile
              icon={<CalendarDays className="size-4" />}
              label={t("conversationView.colleagues.created")}
              value={selectedAgent.createdAt}
            />
            {canInspectPersistentFiles && selectedAgent.persistentState ? (
              <div className="space-y-3 px-1 py-1">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t("conversationView.colleagues.persistentFiles")}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t("conversationView.colleagues.persistentFilesHint")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                      {t("conversationView.colleagues.stateContractVersion", {
                        version: selectedAgent.persistentState.stateVersion,
                      })}
                    </span>
                    {selectedRuntimeStatus ? (
                      <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        {t(selectedRuntimeStatus.labelKey)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <AgentPersistentFilesPanel
                  files={persistentFiles}
                  isLoading={isLoadingPersistentFiles}
                  emptyMessage={t("conversationView.colleagues.persistentFilesEmpty")}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 border-t border-border pt-5">
              {selectedRuntimeStatus?.labelKey ===
                "conversationView.colleagues.runtimeStates.active" &&
              selectedAgentActiveChannelId &&
              onOpenActiveChannel ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenActiveChannel(selectedAgentActiveChannelId)}
                >
                  <MessageSquare className="size-4" />
                  {t("conversationView.backToContext")}
                </Button>
              ) : null}
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
        ) : selectedMember ? (
          <div className="space-y-5 px-6 py-6">
            <div className="flex items-start gap-4">
              {getUserAvatarUrl(selectedMember.user) ? (
                <Avatar className="size-14 shrink-0 rounded-md border border-border">
                  <AvatarImage
                    src={getUserAvatarUrl(selectedMember.user) ?? undefined}
                    alt={getUserDisplayName(
                      selectedMember.user,
                      selectedMember.userId,
                    )}
                  />
                  <AvatarFallback className="rounded-md bg-muted text-lg font-semibold text-foreground">
                    {getUserDisplayName(
                      selectedMember.user,
                      selectedMember.userId,
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground">
                  <UserRound className="size-6" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-foreground">
                  {getUserDisplayName(
                    selectedMember.user,
                    selectedMember.userId,
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedMember.status}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoTile
                icon={<Shield className="size-4" />}
                label={t("conversationView.colleagues.role")}
                value={selectedMember.role}
              />
              <InfoTile
                icon={<CalendarDays className="size-4" />}
                label={t("conversationView.colleagues.joined")}
                value={selectedMember.joinedAt}
              />
            </div>
            <InfoTile
              icon={<UserPlus className="size-4" />}
              label={t("conversationView.colleagues.invitedBy")}
              value={
                selectedMember.invitedBy ||
                t("conversationView.colleagues.emptyValue")
              }
            />
            <div className="border-t border-border pt-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRemoveMember(selectedMember.id)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
                {t("conversationView.colleagues.removeMember")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
            {t("conversationView.colleagues.emptySelection")}
          </div>
        )}
      </div>
    </aside>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-4 py-3">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-2 break-all text-sm text-foreground">{value}</p>
    </div>
  );
}
