import uuid

from sqlalchemy.orm import Session

from app.core.errors.error_codes import ErrorCode
from app.core.errors.exceptions import AppException
from app.models.server_channel import ServerChannel
from app.models.server_channel_message import ServerChannelMessage
from app.models.user import User
from app.repositories.server_channel_message_repository import (
    ServerChannelMessageRepository,
)
from app.repositories.server_channel_repository import (
    ServerChannelMemberRepository,
    ServerChannelRepository,
)
from app.schemas.server_channel_message import (
    ServerChannelMessageCreateRequest,
    ServerChannelMessageResponse,
    ServerChannelThreadResponse,
)
from app.services.server_member_service import require_server_member


class ServerChannelMessageService:
    @staticmethod
    def _build_message_response(
        message: ServerChannelMessage,
        *,
        reply_count: int = 0,
    ) -> ServerChannelMessageResponse:
        return ServerChannelMessageResponse.model_validate(
            message,
        ).model_copy(update={"reply_count": reply_count})

    def _require_channel_access(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        channel_id: uuid.UUID,
    ) -> ServerChannel:
        require_server_member(db, server_id, current_user.id)
        channel = ServerChannelRepository.get_by_id(db, channel_id)
        if channel is None or channel.server_id != server_id:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Channel not found: {channel_id}",
            )
        if channel.visibility == "private":
            membership = ServerChannelMemberRepository.get_by_channel_and_user(
                db,
                channel.id,
                current_user.id,
            )
            if membership is None or membership.status != "active":
                raise AppException(
                    error_code=ErrorCode.FORBIDDEN,
                    message="You are not a member of this private channel",
                )
        return channel

    def send_message(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        channel_id: uuid.UUID,
        request: ServerChannelMessageCreateRequest,
    ) -> ServerChannelMessageResponse:
        channel = self._require_channel_access(db, current_user, server_id, channel_id)
        author_user_id = current_user.id if request.message_type == "user" else None
        thread_root_message_id = request.thread_root_message_id
        if thread_root_message_id is not None:
            root = ServerChannelMessageRepository.get_by_id(db, thread_root_message_id)
            if (
                root is None
                or root.channel_id != channel.id
                or root.thread_root_message_id is not None
            ):
                raise AppException(
                    error_code=ErrorCode.BAD_REQUEST,
                    message="Thread root message is invalid",
                )

        message = ServerChannelMessageRepository.create(
            db,
            ServerChannelMessage(
                channel_id=channel.id,
                author_user_id=author_user_id,
                message_type=request.message_type,
                content=request.content,
                text_preview=request.text_preview,
                thread_root_message_id=thread_root_message_id,
            ),
        )
        db.commit()
        db.refresh(message)
        return self._build_message_response(message)

    def list_messages(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        channel_id: uuid.UUID,
        *,
        before_message_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> list[ServerChannelMessageResponse]:
        channel = self._require_channel_access(db, current_user, server_id, channel_id)
        safe_limit = max(1, min(int(limit), 100))
        messages = ServerChannelMessageRepository.list_by_channel(
            db,
            channel.id,
            before_message_id=before_message_id,
            limit=safe_limit,
        )
        reply_counts = ServerChannelMessageRepository.count_replies_by_roots(
            db,
            [item.id for item in messages],
        )
        return [
            self._build_message_response(item, reply_count=reply_counts.get(item.id, 0))
            for item in messages
        ]

    def get_thread(
        self,
        db: Session,
        current_user: User,
        server_id: uuid.UUID,
        channel_id: uuid.UUID,
        thread_root_message_id: uuid.UUID,
    ) -> ServerChannelThreadResponse:
        channel = self._require_channel_access(db, current_user, server_id, channel_id)
        root = ServerChannelMessageRepository.get_by_id(db, thread_root_message_id)
        if root is None or root.channel_id != channel.id:
            raise AppException(
                error_code=ErrorCode.NOT_FOUND,
                message=f"Thread not found: {thread_root_message_id}",
            )
        root_id = root.thread_root_message_id or root.id
        if root.thread_root_message_id is not None:
            root = ServerChannelMessageRepository.get_by_id(db, root_id)
            if root is None:
                raise AppException(
                    error_code=ErrorCode.NOT_FOUND,
                    message=f"Thread not found: {thread_root_message_id}",
                )
        replies = ServerChannelMessageRepository.list_replies(db, root_id)
        return ServerChannelThreadResponse(
            root=self._build_message_response(root),
            replies=[self._build_message_response(item) for item in replies],
        )
