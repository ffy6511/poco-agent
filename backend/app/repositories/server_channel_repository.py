import uuid

from sqlalchemy.orm import Session

from app.models.server_channel import ServerChannel
from app.models.server_channel_member import ServerChannelMember


class ServerChannelRepository:
    @staticmethod
    def create(session_db: Session, channel: ServerChannel) -> ServerChannel:
        session_db.add(channel)
        return channel

    @staticmethod
    def get_by_id(
        session_db: Session,
        channel_id: uuid.UUID,
        *,
        include_archived: bool = False,
    ) -> ServerChannel | None:
        query = session_db.query(ServerChannel).filter(ServerChannel.id == channel_id)
        if not include_archived:
            query = query.filter(ServerChannel.archived_at.is_(None))
        return query.first()

    @staticmethod
    def get_by_server_slug(
        session_db: Session,
        server_id: uuid.UUID,
        slug: str,
    ) -> ServerChannel | None:
        return (
            session_db.query(ServerChannel)
            .filter(
                ServerChannel.server_id == server_id,
                ServerChannel.slug == slug,
                ServerChannel.archived_at.is_(None),
            )
            .first()
        )

    @staticmethod
    def list_by_server_for_user(
        session_db: Session,
        server_id: uuid.UUID,
        user_id: str,
    ) -> list[ServerChannel]:
        return (
            session_db.query(ServerChannel)
            .outerjoin(
                ServerChannelMember,
                ServerChannelMember.channel_id == ServerChannel.id,
            )
            .filter(
                ServerChannel.server_id == server_id,
                ServerChannel.archived_at.is_(None),
                (
                    (ServerChannel.visibility == "public")
                    | (
                        (ServerChannelMember.user_id == user_id)
                        & (ServerChannelMember.status == "active")
                    )
                ),
            )
            .order_by(ServerChannel.created_at.asc(), ServerChannel.name.asc())
            .all()
        )


class ServerChannelMemberRepository:
    @staticmethod
    def create(
        session_db: Session,
        membership: ServerChannelMember,
    ) -> ServerChannelMember:
        session_db.add(membership)
        return membership

    @staticmethod
    def get_by_channel_and_user(
        session_db: Session,
        channel_id: uuid.UUID,
        user_id: str,
    ) -> ServerChannelMember | None:
        return (
            session_db.query(ServerChannelMember)
            .filter(
                ServerChannelMember.channel_id == channel_id,
                ServerChannelMember.user_id == user_id,
            )
            .first()
        )
