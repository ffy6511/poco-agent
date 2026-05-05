export type ServerKind = "personal" | "shared";
export type ServerChannelVisibility = "public" | "private";
export type ServerConversationType = "channel" | "direct_message";

export interface ServerAgentPersistentState {
  id: string;
  stateRootPath: string;
  profilePath: string;
  memoryPath: string;
  notesDirPath: string;
  stateDirPath: string;
  artifactsDirPath: string;
  stateVersion: number;
  runtimeStatus: string;
  activeTaskId?: string | null;
  activeSessionId?: string | null;
  lastSyncedAt?: string | null;
  lastWrittenAt?: string | null;
}

export interface ServerAgentItem {
  id: string;
  serverId: string;
  presetId: number;
  handle: string;
  displayName: string;
  description?: string | null;
  visualKey: string;
  visibility: string;
  lifecycleState: string;
  createdBy: string;
  updatedBy?: string | null;
  persistentState?: ServerAgentPersistentState | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServerItem {
  id: string;
  name: string;
  slug: string;
  kind: ServerKind;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerChannelItem {
  id: string;
  serverId: string;
  name: string;
  slug: string;
  conversationType: ServerConversationType;
  visibility: ServerChannelVisibility;
  directUserId?: string | null;
  directAgentIdentityId?: string | null;
  createdBy: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServerConversationMessage {
  id: string;
  channelId: string;
  authorUserId?: string | null;
  messageType: "user" | "system" | "task";
  content: Record<string, unknown>;
  textPreview?: string | null;
  threadRootMessageId?: string | null;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}
