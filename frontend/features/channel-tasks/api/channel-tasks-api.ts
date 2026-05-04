import { API_ENDPOINTS, apiClient } from "@/services/api-client";

import type {
  ChannelTask,
  ChannelTaskCreateInput,
  ChannelTaskStatusUpdateInput,
  ChannelTaskStatus,
} from "../model/types";

interface ChannelTaskResponse {
  task_id: string;
  server_id: string;
  channel_id: string;
  title: string;
  description?: string | null;
  status: ChannelTaskStatus;
  position: number;
  priority?: string | null;
  due_date?: string | null;
  assignee_user_id?: string | null;
  assignee_preset_id?: number | null;
  reporter_user_id?: string | null;
  related_project_id?: string | null;
  creator_user_id: string;
  updated_by?: string | null;
  thread_root_message_id?: string | null;
  created_at: string;
  updated_at: string;
}

function mapTask(task: ChannelTaskResponse): ChannelTask {
  return {
    taskId: task.task_id,
    serverId: task.server_id,
    channelId: task.channel_id,
    title: task.title,
    description: task.description,
    status: task.status,
    position: task.position,
    priority: task.priority,
    dueDate: task.due_date,
    assigneeUserId: task.assignee_user_id,
    assigneePresetId: task.assignee_preset_id,
    reporterUserId: task.reporter_user_id,
    relatedProjectId: task.related_project_id,
    creatorUserId: task.creator_user_id,
    updatedBy: task.updated_by,
    threadRootMessageId: task.thread_root_message_id,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

export const channelTasksApi = {
  listTasks: async (serverId: string, channelId: string): Promise<ChannelTask[]> => {
    const tasks = await apiClient.get<ChannelTaskResponse[]>(
      API_ENDPOINTS.serverChannelTasks(serverId, channelId),
    );
    return tasks.map(mapTask);
  },

  createTask: async (
    serverId: string,
    channelId: string,
    input: ChannelTaskCreateInput,
  ): Promise<ChannelTask> => {
    const task = await apiClient.post<ChannelTaskResponse>(
      API_ENDPOINTS.serverChannelTasks(serverId, channelId),
      input,
    );
    return mapTask(task);
  },

  updateTaskStatus: async (
    serverId: string,
    channelId: string,
    taskId: string,
    input: ChannelTaskStatusUpdateInput,
  ): Promise<ChannelTask> => {
    const task = await apiClient.post<ChannelTaskResponse>(
      API_ENDPOINTS.serverChannelTaskStatus(serverId, channelId, taskId),
      input,
    );
    return mapTask(task);
  },
};
