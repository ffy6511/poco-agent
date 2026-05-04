import { apiClient, API_ENDPOINTS } from "@/services/api-client";
import type {
  ServerAgentItem,
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

interface ServerAgentPersistentStateResponse {
  persistent_state_id: string;
  state_root_path: string;
  profile_path: string;
  memory_path: string;
  notes_dir_path: string;
  state_dir_path: string;
  artifacts_dir_path: string;
  state_version: number;
  runtime_status: string;
  active_task_id?: string | null;
  active_session_id?: string | null;
  last_synced_at?: string | null;
  last_written_at?: string | null;
}

interface ServerAgentResponse {
  agent_identity_id: string;
  server_id: string;
  preset_id: number;
  handle: string;
  display_name: string;
  description?: string | null;
  visual_key: string;
  visibility: string;
  lifecycle_state: string;
  created_by: string;
  updated_by?: string | null;
  persistent_state?: ServerAgentPersistentStateResponse | null;
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

function mapAgent(agent: ServerAgentResponse): ServerAgentItem {
  return {
    id: agent.agent_identity_id,
    serverId: agent.server_id,
    presetId: agent.preset_id,
    handle: agent.handle,
    displayName: agent.display_name,
    description: agent.description,
    visualKey: agent.visual_key,
    visibility: agent.visibility,
    lifecycleState: agent.lifecycle_state,
    createdBy: agent.created_by,
    updatedBy: agent.updated_by,
    persistentState: agent.persistent_state
      ? {
          id: agent.persistent_state.persistent_state_id,
          stateRootPath: agent.persistent_state.state_root_path,
          profilePath: agent.persistent_state.profile_path,
          memoryPath: agent.persistent_state.memory_path,
          notesDirPath: agent.persistent_state.notes_dir_path,
          stateDirPath: agent.persistent_state.state_dir_path,
          artifactsDirPath: agent.persistent_state.artifacts_dir_path,
          stateVersion: agent.persistent_state.state_version,
          runtimeStatus: agent.persistent_state.runtime_status,
          activeTaskId: agent.persistent_state.active_task_id,
          activeSessionId: agent.persistent_state.active_session_id,
          lastSyncedAt: agent.persistent_state.last_synced_at,
          lastWrittenAt: agent.persistent_state.last_written_at,
        }
      : null,
    createdAt: agent.created_at,
    updatedAt: agent.updated_at,
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

  listAgents: async (serverId: string): Promise<ServerAgentItem[]> => {
    const agents = await apiClient.get<ServerAgentResponse[]>(
      `/servers/${serverId}/agents`,
    );
    return agents.map(mapAgent);
  },
};
