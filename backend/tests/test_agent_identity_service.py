import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

from app.models.agent_identity import AgentIdentity
from app.models.server import Server
from app.models.server_channel import ServerChannel
from app.models.user import User
from app.schemas.agent_identity import (
    AgentIdentityCreateRequest,
    ChannelAgentMemberCreateRequest,
)
from app.services.agent_identity_service import AgentIdentityService


class AgentIdentityServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.user = User(
            id="user-1",
            primary_email="alice@example.com",
            display_name="Alice",
            avatar_url=None,
            status="active",
        )
        self.server = Server(
            id=uuid.uuid4(),
            name="Poco Core",
            slug="poco-core",
            kind="shared",
            owner_user_id="user-1",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self.channel = ServerChannel(
            id=uuid.uuid4(),
            server_id=self.server.id,
            name="backend",
            slug="backend",
            visibility="public",
            created_by="user-1",
            archived_at=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

    def test_create_agent_creates_identity_and_persistent_state(self) -> None:
        service = AgentIdentityService()
        preset = MagicMock(id=7, visual_key="preset-visual-02")

        with (
            patch(
                "app.services.agent_identity_service.require_server_admin",
                return_value=MagicMock(role="admin"),
            ),
            patch(
                "app.services.agent_identity_service.ServerRepository.get_by_id",
                return_value=self.server,
            ),
            patch(
                "app.services.agent_identity_service.PresetRepository.get_visible_by_id",
                return_value=preset,
            ),
            patch(
                "app.services.agent_identity_service.AgentIdentityRepository.get_by_server_and_handle",
                return_value=None,
            ),
            patch(
                "app.services.agent_identity_service.AgentIdentityRepository.create"
            ) as create_agent,
            patch(
                "app.services.agent_identity_service.AgentPersistentStateRepository.create"
            ) as create_state,
            patch(
                "app.services.agent_identity_service.ensure_agent_state_bootstrap"
            ) as ensure_bootstrap,
            patch(
                "app.services.agent_identity_service.AgentIdentityRepository.get_by_id"
            ) as get_by_id,
        ):
            now = datetime.now(UTC)

            def build_agent(_db, agent_identity):
                agent_identity.id = uuid.uuid4()
                agent_identity.created_at = now
                agent_identity.updated_at = now
                return agent_identity

            create_agent.side_effect = build_agent
            get_by_id.side_effect = lambda _db, _id: create_agent.call_args.args[1]

            result = service.create_agent(
                self.db,
                self.user,
                self.server.id,
                AgentIdentityCreateRequest(
                    display_name="Backend Specialist",
                    preset_id=7,
                ),
            )

        create_agent.assert_called_once()
        create_state.assert_called_once()
        ensure_bootstrap.assert_called_once()
        created = create_agent.call_args.args[1]
        self.assertEqual(created.display_name, "Backend Specialist")
        self.assertEqual(created.preset_id, 7)
        self.assertTrue(created.handle.startswith("backend-specialist"))
        self.assertEqual(result.display_name, "Backend Specialist")
        self.db.commit.assert_called_once()

    def test_add_agent_to_channel_creates_membership(self) -> None:
        service = AgentIdentityService()
        agent_identity = AgentIdentity(
            id=uuid.uuid4(),
            server_id=self.server.id,
            preset_id=7,
            handle="backend-specialist",
            display_name="Backend Specialist",
            description=None,
            visual_key="preset-visual-02",
            visibility="server",
            lifecycle_state="active",
            created_by="user-1",
            updated_by="user-1",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        with (
            patch(
                "app.services.agent_identity_service.require_server_member",
                return_value=MagicMock(role="member"),
            ),
            patch(
                "app.services.agent_identity_service.ServerChannelRepository.get_by_id",
                return_value=self.channel,
            ),
            patch(
                "app.services.agent_identity_service.AgentIdentityRepository.get_by_id",
                return_value=agent_identity,
            ),
            patch(
                "app.services.agent_identity_service.ServerChannelAgentMemberRepository.get_by_channel_and_agent",
                return_value=None,
            ),
            patch(
                "app.services.agent_identity_service.ServerChannelAgentMemberRepository.create"
            ) as create_membership,
        ):
            now = datetime.now(UTC)

            def build_membership(_db, membership):
                membership.id = 12
                membership.joined_at = now
                membership.created_at = now
                membership.updated_at = now
                return membership

            create_membership.side_effect = build_membership

            result = service.add_agent_to_channel(
                self.db,
                self.user,
                self.server.id,
                self.channel.id,
                ChannelAgentMemberCreateRequest(agent_identity_id=agent_identity.id),
            )

        create_membership.assert_called_once()
        self.assertEqual(result.channel_id, self.channel.id)
        self.assertEqual(result.agent_identity_id, agent_identity.id)
        self.db.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
