import uuid
from typing import cast

from sqlalchemy.orm import Session

from app.core.errors.error_codes import ErrorCode
from app.core.errors.exceptions import AppException
from app.models.agent_identity import AgentIdentity
from app.models.agent_persistent_state import AgentPersistentState
from app.models.server_channel_agent_member import ServerChannelAgentMember
from app.models.user import User
from app.repositories.agent_identity_repository import AgentIdentityRepository
from app.repositories.agent_persistent_state_repository import (
    AgentPersistentStateRepository,
)
from app.repositories.preset_repository import PresetRepository
from app.repositories.server_channel_agent_member_repository import (
    ServerChannelAgentMemberRepository,
)
from app.repositories.server_channel_repository import ServerChannelRepository
from app.repositories.server_repository import ServerRepository
from app.schemas.agent_identity import (
    AgentIdentityCreateRequest,
    AgentIdentityResponse,
    AgentPersistentStateResponse,
    ChannelAgentMemberCreateRequest,
    ChannelAgentMemberResponse,
)
from app.services.agent_state_bootstrap_service import ensure_agent_state_bootstrap
from app.services.server_member_service import require_server_admin, require_server_member


class AgentIdentityService:
    @staticmethod
    def _to_agent_response(agent_identity: AgentIdentity) -> AgentIdentityResponse:
        return AgentIdentityResponse.model_validate(agent_identity)

    @staticmethod
    def _to_channel_member_response(
        membership: ServerChannelAgentMember,
    ) -> ChannelAgentMemberResponse:
        return ChannelAgentMemberResponse.model_validate(membership)

    @staticmethod
    def _build_state_paths(agent_identity_id: uuid.UUID) -> dict[str, str]:
        root = f"agents/{agent_identity_id}"
        return {
            "state_root_path": root,
            "profile_path": f"{root}/profile.json",
            "memory_path": f"{root}/MEMORY.md",
            "notes_dir_path": f"{root}/notes",
            "state_dir_path": f"{root}/state",
            "artifacts_dir_path": f"{root}/artifacts",
        }

    @staticmethod
    def _unique_handle(db: Session, server_id: uuid.UUID, value: str) -> str:
        base = AgentIdentity.slugify_handle(value)
        handle = base
        suffix = 2
        while AgentIdentityRepository.get_by_server_and_handle(db, server_id, handle):
            handle = f"{base}-{suffix}"
            suffix += 1
        return handle

    @staticmethod
    def _resolve_preset_for_user(db: Session, user_id: str, preset_id: int):
        preset = PresetRepository.get_visible_by_id(db, preset_id, user_id)
        if preset is None:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Preset not found: {preset_id}",
            )
        return preset

    def list_agents(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
    ) -> list[AgentIdentityResponse]:
        require_server_member(db, server_id, current_user.id)
        return [
            self._to_agent_response(item)
            for item in AgentIdentityRepository.list_by_server(db, server_id)
        ]

    def get_agent(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        agent_identity_id: uuid.UUID,
    ) -> AgentIdentityResponse:
        require_server_member(db, server_id, current_user.id)
        agent_identity = AgentIdentityRepository.get_by_id(db, agent_identity_id)
        if agent_identity is None or agent_identity.server_id != server_id:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Agent identity not found: {agent_identity_id}",
            )
        return self._to_agent_response(agent_identity)

    def create_agent(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        request: AgentIdentityCreateRequest,
    ) -> AgentIdentityResponse:
        require_server_admin(db, server_id, current_user.id)
        server = ServerRepository.get_by_id(db, server_id)
        if server is None:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Server not found: {server_id}",
            )

        preset = self._resolve_preset_for_user(db, current_user.id, request.preset_id)
        handle_seed = request.handle or request.display_name
        handle = self._unique_handle(db, server.id, handle_seed)
        visual_key = (request.visual_key or "").strip() or preset.visual_key
        agent_identity = AgentIdentityRepository.create(
            db,
            AgentIdentity(
                server_id=server.id,
                preset_id=preset.id,
                handle=handle,
                display_name=request.display_name.strip(),
                description=(request.description or "").strip() or None,
                visual_key=visual_key,
                visibility=request.visibility.strip() or "server",
                lifecycle_state="active",
                created_by=current_user.id,
                updated_by=current_user.id,
            ),
        )
        db.flush()

        persistent_state = AgentPersistentState(
            agent_identity_id=agent_identity.id,
            runtime_status="idle",
            state_version=1,
            **self._build_state_paths(agent_identity.id),
        )
        AgentPersistentStateRepository.create(
            db,
            persistent_state,
        )
        ensure_agent_state_bootstrap(
            agent_identity=agent_identity,
            persistent_state=persistent_state,
        )
        db.commit()
        db.refresh(agent_identity)
        agent_identity = cast(
            AgentIdentity,
            AgentIdentityRepository.get_by_id(db, agent_identity.id),
        )
        return self._to_agent_response(agent_identity)

    def list_channel_agents(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        channel_id: uuid.UUID,
    ) -> list[AgentIdentityResponse]:
        require_server_member(db, server_id, current_user.id)
        channel = ServerChannelRepository.get_by_id(db, channel_id)
        if channel is None or channel.server_id != server_id:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Channel not found: {channel_id}",
            )

        memberships = ServerChannelAgentMemberRepository.list_by_channel(db, channel.id)
        agent_responses: list[AgentIdentityResponse] = []
        for membership in memberships:
            agent_identity = AgentIdentityRepository.get_by_id(db, membership.agent_identity_id)
            if agent_identity is None:
                continue
            agent_responses.append(self._to_agent_response(agent_identity))
        return agent_responses

    def add_agent_to_channel(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        channel_id: uuid.UUID,
        request: ChannelAgentMemberCreateRequest,
    ) -> ChannelAgentMemberResponse:
        require_server_member(db, server_id, current_user.id)
        channel = ServerChannelRepository.get_by_id(db, channel_id)
        if channel is None or channel.server_id != server_id:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Channel not found: {channel_id}",
            )
        agent_identity = AgentIdentityRepository.get_by_id(db, request.agent_identity_id)
        if agent_identity is None or agent_identity.server_id != server_id:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Agent identity not found: {request.agent_identity_id}",
            )
        existing = ServerChannelAgentMemberRepository.get_by_channel_and_agent(
            db,
            channel.id,
            agent_identity.id,
        )
        if existing is not None:
            return self._to_channel_member_response(existing)

        membership = ServerChannelAgentMemberRepository.create(
            db,
            ServerChannelAgentMember(
                channel_id=channel.id,
                agent_identity_id=agent_identity.id,
                role=request.role,
                status="active",
            ),
        )
        db.commit()
        db.refresh(membership)
        return self._to_channel_member_response(membership)
