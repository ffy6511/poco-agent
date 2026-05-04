export type ServerKind = "personal" | "shared";
export type ServerChannelVisibility = "public" | "private";

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
  visibility: ServerChannelVisibility;
  createdBy: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
