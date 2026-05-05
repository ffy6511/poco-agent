import { apiClient, API_ENDPOINTS } from "@/services/api-client";
import type {
  ServerAgentItem,
  ServerChannelItem,
  ServerChannelMemberItem,
  ServerChannelVisibility,
  ServerConversationMessage,
  ServerConversationType,
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
  description?: string | null;
  conversation_type: ServerConversationType;
  visibility: ServerChannelVisibility;
  direct_user_id?: string | null;
  direct_agent_identity_id?: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ServerChannelMemberResponse {
  membership_id: number;
  channel_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  status: string;
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

interface ServerConversationMessageResponse {
  message_id: string;
  channel_id: string;
  author_user_id?: string | null;
  message_type: "user" | "system" | "task";
  content: Record<string, unknown>;
  text_preview?: string | null;
  thread_root_message_id?: string | null;
  reply_count: number;
  created_at: string;
  updated_at: string;
}

interface ServerConversationThreadResponse {
  root: ServerConversationMessageResponse;
  replies: ServerConversationMessageResponse[];
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
    description: channel.description,
    conversationType: channel.conversation_type,
    visibility: channel.visibility,
    directUserId: channel.direct_user_id,
    directAgentIdentityId: channel.direct_agent_identity_id,
    createdBy: channel.created_by,
    archivedAt: channel.archived_at,
    createdAt: channel.created_at,
    updatedAt: channel.updated_at,
  };
}

function mapChannelMember(
  member: ServerChannelMemberResponse,
): ServerChannelMemberItem {
  return {
    id: member.membership_id,
    channelId: member.channel_id,
    userId: member.user_id,
    role: member.role,
    joinedAt: member.joined_at,
    status: member.status,
    createdAt: member.created_at,
    updatedAt: member.updated_at,
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

function mapConversationMessage(
  message: ServerConversationMessageResponse,
): ServerConversationMessage {
  return {
    id: message.message_id,
    channelId: message.channel_id,
    authorUserId: message.author_user_id,
    messageType: message.message_type,
    content: message.content,
    textPreview: message.text_preview,
    threadRootMessageId: message.thread_root_message_id,
    replyCount: message.reply_count,
    createdAt: message.created_at,
    updatedAt: message.updated_at,
  };
}

export const serversApi = {
  listServers: async (): Promise<ServerItem[]> => {
    const servers = await apiClient.get<ServerResponse[]>(
      API_ENDPOINTS.servers,
    );
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

  listChannelAgents: async (
    serverId: string,
    channelId: string,
  ): Promise<ServerAgentItem[]> => {
    const agents = await apiClient.get<ServerAgentResponse[]>(
      `/servers/${serverId}/channels/${channelId}/agents`,
    );
    return agents.map(mapAgent);
  },

  listMessages: async (
    serverId: string,
    channelId: string,
  ): Promise<ServerConversationMessage[]> => {
    const messages = await apiClient.get<ServerConversationMessageResponse[]>(
      `/servers/${serverId}/channels/${channelId}/messages`,
    );
    return messages.map(mapConversationMessage);
  },

  sendMessage: async (
    serverId: string,
    channelId: string,
    input: {
      text: string;
      threadRootMessageId?: string | null;
    },
  ): Promise<ServerConversationMessage> => {
    const message = await apiClient.post<ServerConversationMessageResponse>(
      `/servers/${serverId}/channels/${channelId}/messages`,
      {
        message_type: "user",
        text_preview: input.text,
        thread_root_message_id: input.threadRootMessageId ?? null,
        content: {
          text: input.text,
        },
      },
    );
    return mapConversationMessage(message);
  },

  getThread: async (
    serverId: string,
    channelId: string,
    threadRootMessageId: string,
  ): Promise<ServerConversationMessage[]> => {
    const thread = await apiClient.get<ServerConversationThreadResponse>(
      `/servers/${serverId}/channels/${channelId}/threads/${threadRootMessageId}`,
    );
    return [thread.root, ...thread.replies].map(mapConversationMessage);
  },

  createDirectMessage: async (
    serverId: string,
    input: {
      targetUserId?: string | null;
      targetAgentIdentityId?: string | null;
    },
  ): Promise<ServerChannelItem> => {
    const channel = await apiClient.post<ServerChannelResponse>(
      `/servers/${serverId}/direct-messages`,
      {
        target_user_id: input.targetUserId ?? null,
        target_agent_identity_id: input.targetAgentIdentityId ?? null,
      },
    );
    return mapChannel(channel);
  },

  updateChannel: async (
    serverId: string,
    channelId: string,
    input: {
      name?: string | null;
      description?: string | null;
    },
  ): Promise<ServerChannelItem> => {
    const channel = await apiClient.patch<ServerChannelResponse>(
      `/servers/${serverId}/channels/${channelId}`,
      input,
    );
    return mapChannel(channel);
  },

  archiveChannel: async (
    serverId: string,
    channelId: string,
  ): Promise<ServerChannelItem> => {
    const channel = await apiClient.post<ServerChannelResponse>(
      `/servers/${serverId}/channels/${channelId}/archive`,
    );
    return mapChannel(channel);
  },

  deleteChannel: async (serverId: string, channelId: string): Promise<void> => {
    await apiClient.delete(`/servers/${serverId}/channels/${channelId}`);
  },

  listChannelMembers: async (
    serverId: string,
    channelId: string,
  ): Promise<ServerChannelMemberItem[]> => {
    const members = await apiClient.get<ServerChannelMemberResponse[]>(
      `/servers/${serverId}/channels/${channelId}/members`,
    );
    return members.map(mapChannelMember);
  },

  addChannelMember: async (
    serverId: string,
    channelId: string,
    input: {
      userId: string;
      role?: string;
    },
  ): Promise<ServerChannelMemberItem> => {
    const member = await apiClient.post<ServerChannelMemberResponse>(
      `/servers/${serverId}/channels/${channelId}/members`,
      {
        user_id: input.userId,
        role: input.role ?? "member",
      },
    );
    return mapChannelMember(member);
  },
};
