import re
import uuid

from sqlalchemy.orm import Session

from app.repositories.agent_identity_repository import AgentIdentityRepository
from app.repositories.server_channel_agent_member_repository import (
    ServerChannelAgentMemberRepository,
)
from app.schemas.session import TaskConfig
from app.schemas.task import TaskEnqueueRequest, TaskEnqueueResponse
from app.services.channel_shared_context_service import ChannelSharedContextService
from app.services.task_service import TaskService


class ServerAgentTriggerService:
    MENTION_PATTERN = re.compile(r"(?:^|\s)@([A-Za-z0-9._-]+)(?=$|[\s,.!?;:])")

    def __init__(
        self,
        *,
        task_service: TaskService | None = None,
        shared_context_service: ChannelSharedContextService | None = None,
    ) -> None:
        self._task_service = task_service or TaskService()
        self._shared_context_service = (
            shared_context_service or ChannelSharedContextService()
        )

    def _collect_target_agents(
        self,
        db: Session,
        *,
        channel,
        message,
    ) -> list:
        if (
            channel.conversation_type == "direct_message"
            and channel.direct_agent_identity_id
        ):
            agent = AgentIdentityRepository.get_by_id(db, channel.direct_agent_identity_id)
            return [agent] if agent is not None else []

        message_text = ""
        content = getattr(message, "content", None)
        if isinstance(content, dict):
            raw_text = content.get("text")
            if isinstance(raw_text, str):
                message_text = raw_text
        if not message_text:
            message_text = getattr(message, "text_preview", "") or ""
        handles = {
            match.group(1).strip().lower()
            for match in self.MENTION_PATTERN.finditer(message_text)
            if match.group(1).strip()
        }
        if not handles:
            return []

        memberships = ServerChannelAgentMemberRepository.list_by_channel(db, channel.id)
        matched = []
        for membership in memberships:
            agent = AgentIdentityRepository.get_by_id(db, membership.agent_identity_id)
            if agent is None or agent.lifecycle_state != "active":
                continue
            if agent.handle.strip().lower() in handles:
                matched.append(agent)
        return matched

    def trigger_for_channel_message(
        self,
        db: Session,
        *,
        current_user,
        server_id: uuid.UUID,
        channel,
        message,
    ) -> list[TaskEnqueueResponse]:
        agents = self._collect_target_agents(
            db,
            channel=channel,
            message=message,
        )
        results: list[TaskEnqueueResponse] = []
        trigger_type = (
            "agent_dm"
            if channel.conversation_type == "direct_message"
            and channel.direct_agent_identity_id
            else "channel_mention"
        )
        thread_root_message_id = getattr(message, "thread_root_message_id", None) or getattr(
            message,
            "id",
            None,
        )

        for agent in agents:
            prompt = self._shared_context_service.build_message_trigger_prompt(
                db,
                server_id=server_id,
                channel_id=channel.id,
                message=message,
                current_user=current_user,
                agent_display_name=agent.display_name,
                agent_handle=agent.handle,
            )
            active_session_id = None
            if getattr(agent, "persistent_state", None) is not None:
                active_session_id = getattr(
                    agent.persistent_state,
                    "active_session_id",
                    None,
                )

            request = TaskEnqueueRequest(
                prompt=prompt,
                session_id=active_session_id,
                permission_mode="acceptEdits",
                schedule_mode="immediate",
                client_request_id=f"channel-trigger:{message.id}:{agent.id}",
                config=TaskConfig(
                    preset_id=agent.preset_id,
                    container_mode="persistent",
                    filesystem_mode="sandbox",
                    agent_identity_id=agent.id,
                    agent_runtime_mode="persistent",
                    server_id=server_id,
                    channel_id=channel.id,
                    trigger_message_id=message.id,
                    thread_root_message_id=thread_root_message_id,
                    trigger_type=trigger_type,
                ),
            )
            results.append(
                self._task_service.enqueue_task(
                    db,
                    agent.created_by,
                    request,
                )
            )
        return results
