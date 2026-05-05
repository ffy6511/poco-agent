import type { ServerChannelItem, ServerConversationMessage } from "@/features/servers/model/types";

export type WorkspaceMode =
  | "search"
  | "inbox"
  | "saved"
  | "tasks"
  | "conversation";
export type ConversationTab = "chat";
export type DrawerState =
  | { type: "none" }
  | { type: "thread"; channelId: string; rootMessageId: string }
  | { type: "task"; taskId: string }
  | { type: "agent"; agentId?: string | null };

export type FeedItem = {
  channel: ServerChannelItem;
  message: ServerConversationMessage;
};
