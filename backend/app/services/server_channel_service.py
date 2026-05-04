import re
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.errors.error_codes import ErrorCode
from app.core.errors.exceptions import AppException
from app.models.server_channel import ServerChannel
from app.models.server_channel_member import ServerChannelMember
from app.models.user import User
from app.repositories.server_channel_repository import (
    ServerChannelMemberRepository,
    ServerChannelRepository,
)
from app.repositories.server_repository import ServerRepository
from app.schemas.server_channel import (
    ServerChannelCreateRequest,
    ServerChannelMemberResponse,
    ServerChannelResponse,
)
from app.services.server_member_service import (
    require_server_admin,
    require_server_member,
)


class ServerChannelService:
    @staticmethod
    def _slugify(value: str) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
        return normalized or "channel"

    @classmethod
    def _unique_slug(cls, db: Session, server_id: uuid.UUID, base_slug: str) -> str:
        slug = base_slug
        suffix = 2
        while (
            ServerChannelRepository.get_by_server_slug(db, server_id, slug) is not None
        ):
            slug = f"{base_slug}-{suffix}"
            suffix += 1
        return slug

    @staticmethod
    def _build_channel_response(channel: ServerChannel) -> ServerChannelResponse:
        return ServerChannelResponse.model_validate(channel)

    def list_channels(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
    ) -> list[ServerChannelResponse]:
        require_server_member(db, server_id, current_user.id)
        channels = ServerChannelRepository.list_by_server_for_user(
            db,
            server_id,
            current_user.id,
        )
        return [self._build_channel_response(item) for item in channels]

    def create_channel(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        request: ServerChannelCreateRequest,
    ) -> ServerChannelResponse:
        require_server_member(db, server_id, current_user.id)
        server = ServerRepository.get_by_id(db, server_id)
        if server is None:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Server not found: {server_id}",
            )

        name = request.name.strip()
        if not name:
            raise AppException(
                error_code=ErrorCode.BAD_REQUEST,
                message="Channel name cannot be empty",
            )
        channel = ServerChannelRepository.create(
            db,
            ServerChannel(
                server_id=server.id,
                name=name,
                slug=self._unique_slug(db, server.id, self._slugify(name)),
                visibility=request.visibility,
                created_by=current_user.id,
            ),
        )
        ServerChannelMemberRepository.create(
            db,
            ServerChannelMember(
                channel=channel,
                user_id=current_user.id,
                role="owner",
                status="active",
            ),
        )
        db.commit()
        db.refresh(channel)
        return self._build_channel_response(channel)

    def archive_channel(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        channel_id: uuid.UUID,
    ) -> ServerChannelResponse:
        require_server_admin(db, server_id, current_user.id)
        channel = ServerChannelRepository.get_by_id(db, channel_id)
        if channel is None or channel.server_id != server_id:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Channel not found: {channel_id}",
            )
        channel.archived_at = datetime.now(UTC)
        db.commit()
        return self._build_channel_response(channel)

    def join_channel(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        channel_id: uuid.UUID,
    ) -> ServerChannelMemberResponse:
        require_server_member(db, server_id, current_user.id)
        channel = ServerChannelRepository.get_by_id(db, channel_id)
        if channel is None or channel.server_id != server_id:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Channel not found: {channel_id}",
            )
        if channel.visibility != "public":
            raise AppException(
                error_code=ErrorCode.FORBIDDEN,
                message="Private channels require an invitation",
            )
        membership = ServerChannelMemberRepository.get_by_channel_and_user(
            db,
            channel_id,
            current_user.id,
        )
        if membership is None:
            membership = ServerChannelMemberRepository.create(
                db,
                ServerChannelMember(
                    channel_id=channel.id,
                    user_id=current_user.id,
                    role="member",
                    status="active",
                ),
            )
        else:
            membership.status = "active"
        db.commit()
        db.refresh(membership)
        return ServerChannelMemberResponse.model_validate(membership)

    def leave_channel(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        channel_id: uuid.UUID,
    ) -> None:
        require_server_member(db, server_id, current_user.id)
        channel = ServerChannelRepository.get_by_id(db, channel_id)
        if channel is None or channel.server_id != server_id:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Channel not found: {channel_id}",
            )
        membership = ServerChannelMemberRepository.get_by_channel_and_user(
            db,
            channel_id,
            current_user.id,
        )
        if membership is not None:
            membership.status = "left"
            db.commit()
