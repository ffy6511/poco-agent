export type ServerKind = "personal" | "shared";
export type ServerChannelVisibility = "public" | "private";

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
