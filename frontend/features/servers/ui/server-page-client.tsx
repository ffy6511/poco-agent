"use client";

import * as React from "react";
import Link from "next/link";
import { Hash, Lock, RefreshCw, Server, Users } from "lucide-react";
import { toast } from "sonner";

import { PageHeaderShell } from "@/components/shared/page-header-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { serversApi } from "@/features/servers/api/servers-api";
import type {
  ServerAgentItem,
  ServerChannelItem,
  ServerItem,
} from "@/features/servers/model/types";
import { ServerAgentDetailDialog } from "@/features/servers/ui/server-agent-detail-dialog";
import { useLanguage } from "@/hooks/use-language";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

export function ServerPageClient() {
  const { t } = useT("translation");
  const lng = useLanguage() || "en";
  const [servers, setServers] = React.useState<ServerItem[]>([]);
  const [channels, setChannels] = React.useState<ServerChannelItem[]>([]);
  const [agents, setAgents] = React.useState<ServerAgentItem[]>([]);
  const [selectedServerId, setSelectedServerId] = React.useState<string | null>(
    null,
  );
  const [isLoadingServers, setIsLoadingServers] = React.useState(true);
  const [isLoadingChannels, setIsLoadingChannels] = React.useState(false);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);

  const selectedServer =
    servers.find((server) => server.id === selectedServerId) ?? servers[0] ?? null;

  const loadServers = React.useCallback(async () => {
    setIsLoadingServers(true);
    try {
      const nextServers = await serversApi.listServers();
      setServers(nextServers);
      setSelectedServerId((current) => {
        if (current && nextServers.some((server) => server.id === current)) {
          return current;
        }
        return nextServers[0]?.id ?? null;
      });
    } catch (error) {
      console.error("[Servers] list failed", error);
      toast.error(t("servers.toasts.loadFailed"));
    } finally {
      setIsLoadingServers(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadServers();
  }, [loadServers]);

  React.useEffect(() => {
    const loadChannels = async () => {
      if (!selectedServer) {
        setChannels([]);
        return;
      }

      setIsLoadingChannels(true);
      try {
        const [nextChannels, nextAgents] = await Promise.all([
          serversApi.listChannels(selectedServer.id),
          serversApi.listAgents(selectedServer.id),
        ]);
        setChannels(nextChannels);
        setAgents(nextAgents);
      } catch (error) {
        console.error("[Servers] channel list failed", error);
        toast.error(t("servers.toasts.channelsLoadFailed"));
      } finally {
        setIsLoadingChannels(false);
      }
    };

    void loadChannels();
  }, [selectedServer, t]);

  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? null;

  return (
    <>
      <PageHeaderShell
        left={
          <div className="min-w-0 space-y-1.5">
            <p className="truncate text-base font-semibold leading-tight text-foreground">
              {t("servers.title")}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {selectedServer
                ? t("servers.currentServer", { name: selectedServer.name })
                : t("servers.noServer")}
            </p>
          </div>
        }
        right={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadServers()}
            disabled={isLoadingServers}
          >
            <RefreshCw
              className={cn("size-4", isLoadingServers && "animate-spin")}
            />
            {t("servers.refresh")}
          </Button>
        }
      />

      <main className="flex-1 overflow-auto px-4 pb-6 pt-8 sm:px-6">
        <div className="grid w-full gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <section className="min-w-0 space-y-3">
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold text-foreground">
                {t("servers.listTitle")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("servers.listDescription")}
              </p>
            </div>

            <div className="space-y-3">
              {isLoadingServers
                ? Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-20 rounded-md" />
                  ))
                : servers.map((server) => {
                    const isSelected = selectedServer?.id === server.id;
                    return (
                      <button
                        key={server.id}
                        type="button"
                        onClick={() => setSelectedServerId(server.id)}
                        className={cn(
                          "flex w-full min-w-0 items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors",
                          isSelected
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : "border-border bg-card hover:bg-muted/50",
                        )}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Server className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {server.name}
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">
                              {t(`servers.kinds.${server.kind}`)}
                            </Badge>
                            <span className="truncate">{server.slug}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
            </div>
          </section>

          <section className="min-w-0 space-y-6">
            <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <h2 className="truncate text-lg font-semibold text-foreground">
                  {selectedServer?.name ?? t("servers.noServer")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedServer
                    ? t("servers.createdAt", {
                        date: formatDate(selectedServer.createdAt),
                      })
                    : t("servers.selectPrompt")}
                </p>
              </div>
              {selectedServer ? (
                <Badge variant="outline">
                  <Users className="size-3.5" />
                  {t(`servers.kinds.${selectedServer.kind}`)}
                </Badge>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("servers.channelsTitle")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("servers.channelsDescription")}
                </p>
              </div>

              {isLoadingChannels ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-24 rounded-md" />
                  ))}
                </div>
              ) : channels.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {channels.map((channel) => {
                    const isPrivate = channel.visibility === "private";
                    const Icon = isPrivate ? Lock : Hash;
                    return (
                      <Link
                        key={channel.id}
                        href={`/${lng}/servers/${selectedServer.id}/channels/${channel.id}`}
                        className="min-w-0 rounded-md border border-border bg-card p-4 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-medium text-foreground">
                                {channel.name}
                              </h4>
                              <p className="truncate text-xs text-muted-foreground">
                                {channel.slug}
                              </p>
                            </div>
                            <Badge variant={isPrivate ? "outline" : "secondary"}>
                              {t(`servers.channelVisibility.${channel.visibility}`)}
                            </Badge>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Empty className="min-h-64 rounded-md border border-dashed border-border bg-muted/10">
                  <EmptyContent>
                    <EmptyMedia variant="icon">
                      <Hash className="size-5" />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle>{t("servers.emptyChannelsTitle")}</EmptyTitle>
                      <EmptyDescription>
                        {t("servers.emptyChannelsDescription")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </EmptyContent>
                </Empty>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("servers.agents.title")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("servers.agents.description")}
                </p>
              </div>

              {isLoadingChannels ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <Skeleton key={index} className="h-28 rounded-md" />
                  ))}
                </div>
              ) : agents.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setSelectedAgentId(agent.id)}
                      className="min-w-0 rounded-md border border-border bg-card p-4 text-left transition-colors hover:bg-muted/30"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {agent.displayName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              @{agent.handle}
                            </p>
                          </div>
                          <Badge variant="secondary">
                            {agent.persistentState?.runtimeStatus ??
                              t("servers.agents.unknown")}
                          </Badge>
                        </div>
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {agent.description || t("servers.agents.emptyDescription")}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty className="min-h-48 rounded-md border border-dashed border-border bg-muted/10">
                  <EmptyContent>
                    <EmptyHeader>
                      <EmptyTitle>{t("servers.agents.emptyTitle")}</EmptyTitle>
                      <EmptyDescription>
                        {t("servers.agents.emptyDescription")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </EmptyContent>
                </Empty>
              )}
            </div>
          </section>
        </div>
      </main>

      <ServerAgentDetailDialog
        open={Boolean(selectedAgent)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAgentId(null);
          }
        }}
        agent={selectedAgent}
      />
    </>
  );
}
