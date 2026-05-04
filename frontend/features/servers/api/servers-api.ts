import { apiClient, API_ENDPOINTS } from "@/services/api-client";
import type {
  ServerChannelItem,
  ServerChannelVisibility,
  ServerItem,
  ServerKind,
} from "@/features/servers/model/types";

interface ServerResponse {
  server_id: string;
  name: string;
  slug: string;
  kind: ServerKind;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

interface ServerChannelResponse {
  channel_id: string;
  server_id: string;
  name: string;
  slug: string;
  visibility: ServerChannelVisibility;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapServer(server: ServerResponse): ServerItem {
  return {
    id: server.server_id,
    name: server.name,
    slug: server.slug,
    kind: server.kind,
    ownerUserId: server.owner_user_id,
    createdAt: server.created_at,
    updatedAt: server.updated_at,
  };
}

function mapChannel(channel: ServerChannelResponse): ServerChannelItem {
  return {
    id: channel.channel_id,
    serverId: channel.server_id,
    name: channel.name,
    slug: channel.slug,
    visibility: channel.visibility,
    createdBy: channel.created_by,
    archivedAt: channel.archived_at,
    createdAt: channel.created_at,
    updatedAt: channel.updated_at,
  };
}

export const serversApi = {
  listServers: async (): Promise<ServerItem[]> => {
    const servers = await apiClient.get<ServerResponse[]>(API_ENDPOINTS.servers);
    return servers.map(mapServer);
  },

  listChannels: async (serverId: string): Promise<ServerChannelItem[]> => {
    const channels = await apiClient.get<ServerChannelResponse[]>(
      API_ENDPOINTS.serverChannels(serverId),
    );
    return channels.map(mapChannel);
  },
};
