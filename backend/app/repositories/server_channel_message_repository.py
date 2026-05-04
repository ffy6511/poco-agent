import uuid

from sqlalchemy.orm import Session

from app.models.server_channel_message import ServerChannelMessage


class ServerChannelMessageRepository:
    @staticmethod
    def create(
        session_db: Session,
        message: ServerChannelMessage,
    ) -> ServerChannelMessage:
        session_db.add(message)
        return message

    @staticmethod
    def get_by_id(
        session_db: Session,
        message_id: uuid.UUID,
    ) -> ServerChannelMessage | None:
        return (
            session_db.query(ServerChannelMessage)
            .filter(ServerChannelMessage.id == message_id)
            .first()
        )

    @staticmethod
    def list_by_channel(
        session_db: Session,
        channel_id: uuid.UUID,
        *,
        before_message_id: uuid.UUID | None = None,
        limit: int = 50,
    ) -> list[ServerChannelMessage]:
        query = session_db.query(ServerChannelMessage).filter(
            ServerChannelMessage.channel_id == channel_id,
            ServerChannelMessage.thread_root_message_id.is_(None),
        )
        if before_message_id is not None:
            before = ServerChannelMessageRepository.get_by_id(
                session_db,
                before_message_id,
            )
            if before is not None:
                query = query.filter(ServerChannelMessage.created_at < before.created_at)
        return (
            query.order_by(
                ServerChannelMessage.created_at.desc(),
                ServerChannelMessage.id.desc(),
            )
            .limit(limit)
            .all()
        )

    @staticmethod
    def list_replies(
        session_db: Session,
        thread_root_message_id: uuid.UUID,
        *,
        limit: int = 100,
    ) -> list[ServerChannelMessage]:
        return (
            session_db.query(ServerChannelMessage)
            .filter(
                ServerChannelMessage.thread_root_message_id == thread_root_message_id,
            )
            .order_by(
                ServerChannelMessage.created_at.asc(),
                ServerChannelMessage.id.asc(),
            )
            .limit(limit)
            .all()
        )
