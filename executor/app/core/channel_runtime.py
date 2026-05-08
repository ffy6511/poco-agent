import json
from typing import Any

import httpx
from claude_agent_sdk import create_sdk_mcp_server, tool
from claude_agent_sdk.types import McpSdkServerConfig

from app.core.observability.request_context import (
    generate_request_id,
    generate_trace_id,
    get_request_id,
    get_trace_id,
)

CHANNEL_RUNTIME_MCP_SERVER_KEY = "__poco_channel_runtime"


class ChannelRuntimeClient:
    def __init__(self, base_url: str, session_id: str, timeout: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.session_id = session_id
        self.timeout = timeout

    @staticmethod
    def _trace_headers() -> dict[str, str]:
        return {
            "X-Request-ID": get_request_id() or generate_request_id(),
            "X-Trace-ID": get_trace_id() or generate_trace_id(),
        }

    async def _request(self, path: str, payload: dict[str, Any]) -> Any:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}{path}",
                json={"session_id": self.session_id, **payload},
                headers=self._trace_headers(),
            )
            response.raise_for_status()

        body = response.json()
        if not isinstance(body, dict):
            raise RuntimeError("Invalid channel runtime response")
        if body.get("code") != 0:
            raise RuntimeError(str(body.get("message") or "Channel runtime error"))
        return body.get("data")

    async def add_message_reaction(self, *, message_id: str, emoji: str) -> Any:
        return await self._request(
            "/api/v1/agent-channel-runtime/reactions/add",
            {"message_id": message_id, "emoji": emoji},
        )

    async def remove_message_reaction(self, *, message_id: str, emoji: str) -> Any:
        return await self._request(
            "/api/v1/agent-channel-runtime/reactions/remove",
            {"message_id": message_id, "emoji": emoji},
        )


def _format_tool_result(title: str, data: Any) -> dict[str, Any]:
    body = json.dumps(data, ensure_ascii=False, indent=2, default=str)
    return {"content": [{"type": "text", "text": f"{title}\n{body}"}]}


async def _run_tool(title: str, operation) -> dict[str, Any]:
    try:
        result = await operation
    except Exception as exc:
        return _format_tool_result(f"{title}_error", {"error": str(exc)})
    return _format_tool_result(title, result)


def create_channel_runtime_mcp_server(
    runtime_client: ChannelRuntimeClient,
) -> McpSdkServerConfig:
    @tool(
        "add_channel_message_reaction",
        "Add an emoji reaction to a message in the current channel",
        {"message_id": str, "emoji": str},
    )
    async def add_channel_message_reaction(args: dict[str, Any]) -> dict[str, Any]:
        message_id = args.get("message_id")
        emoji = args.get("emoji")
        if not isinstance(message_id, str) or not message_id.strip():
            return _format_tool_result(
                "add_channel_message_reaction_error",
                {"error": "message_id must be a non-empty string"},
            )
        if not isinstance(emoji, str) or not emoji.strip():
            return _format_tool_result(
                "add_channel_message_reaction_error",
                {"error": "emoji must be a non-empty string"},
            )
        return await _run_tool(
            "add_channel_message_reaction",
            runtime_client.add_message_reaction(
                message_id=message_id.strip(),
                emoji=emoji.strip(),
            ),
        )

    @tool(
        "remove_channel_message_reaction",
        "Remove this agent's emoji reaction from a message in the current channel",
        {"message_id": str, "emoji": str},
    )
    async def remove_channel_message_reaction(args: dict[str, Any]) -> dict[str, Any]:
        message_id = args.get("message_id")
        emoji = args.get("emoji")
        if not isinstance(message_id, str) or not message_id.strip():
            return _format_tool_result(
                "remove_channel_message_reaction_error",
                {"error": "message_id must be a non-empty string"},
            )
        if not isinstance(emoji, str) or not emoji.strip():
            return _format_tool_result(
                "remove_channel_message_reaction_error",
                {"error": "emoji must be a non-empty string"},
            )
        return await _run_tool(
            "remove_channel_message_reaction",
            runtime_client.remove_message_reaction(
                message_id=message_id.strip(),
                emoji=emoji.strip(),
            ),
        )

    return create_sdk_mcp_server(
        name="poco-channel-runtime",
        version="0.1.0",
        tools=[
            add_channel_message_reaction,
            remove_channel_message_reaction,
        ],
    )
