import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.agent_channel_runtime import router


class AgentChannelRuntimeApiTests(unittest.TestCase):
    def test_add_reaction_proxies_session_payload(self) -> None:
        app = FastAPI()
        app.include_router(router, prefix="/api/v1")

        with patch(
            "app.api.v1.agent_channel_runtime.backend_client.add_agent_channel_message_reaction",
            new=AsyncMock(return_value={"action": "add_channel_message_reaction"}),
        ) as add_reaction:
            response = TestClient(app).post(
                "/api/v1/agent-channel-runtime/reactions/add",
                json={
                    "session_id": "session-1",
                    "message_id": "message-1",
                    "emoji": "👍",
                },
            )

        self.assertEqual(response.status_code, 200)
        add_reaction.assert_awaited_once_with(
            "session-1",
            {"message_id": "message-1", "emoji": "👍"},
        )

    def test_remove_reaction_proxies_session_payload(self) -> None:
        app = FastAPI()
        app.include_router(router, prefix="/api/v1")

        with patch(
            "app.api.v1.agent_channel_runtime.backend_client.remove_agent_channel_message_reaction",
            new=AsyncMock(return_value={"action": "remove_channel_message_reaction"}),
        ) as remove_reaction:
            response = TestClient(app).post(
                "/api/v1/agent-channel-runtime/reactions/remove",
                json={
                    "session_id": "session-1",
                    "message_id": "message-1",
                    "emoji": "✅",
                },
            )

        self.assertEqual(response.status_code, 200)
        remove_reaction.assert_awaited_once_with(
            "session-1",
            {"message_id": "message-1", "emoji": "✅"},
        )


if __name__ == "__main__":
    unittest.main()
