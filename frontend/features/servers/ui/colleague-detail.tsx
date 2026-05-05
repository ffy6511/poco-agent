"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Bot,
  CalendarDays,
  Clipboard,
  MessageSquare,
  Shield,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getUserAvatarUrl,
  getUserDisplayName,
} from "@/features/servers/lib/server-conversation-view";
import type {
  ServerAgentItem,
  ServerMemberItem,
} from "@/features/servers/model/types";
import type { ColleagueSelection } from "@/features/servers/ui/server-workspace-types";
import { useT } from "@/lib/i18n/client";

export function ColleagueDetail({
  selection,
  agents,
  members,
  onClose,
  onOpenDm,
  onRemoveMember,
}: {
  selection: ColleagueSelection | null;
  agents: ServerAgentItem[];
  members: ServerMemberItem[];
  onClose: () => void;
  onOpenDm: (agentId: string) => void;
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

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-card md:left-[17rem] md:w-auto lg:left-[18rem] xl:static xl:min-w-0 xl:flex-1">
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
              <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border bg-primary/10 text-foreground">
                <Bot className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-foreground">
                  {selectedAgent.displayName}
                </p>
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
                  t("servers.agents.emptyDescription")}
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
            <div className="flex flex-wrap gap-2 border-t border-border pt-5">
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
