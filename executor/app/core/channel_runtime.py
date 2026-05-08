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

    async def read_messages(
        self,
        *,
        message_ids: list[str] | None,
        thread_root_message_id: str | None,
        limit: int | None,
    ) -> Any:
        return await self._request(
            "/api/v1/agent-channel-runtime/messages/read",
            {
                "message_ids": message_ids or [],
                "thread_root_message_id": thread_root_message_id,
                "limit": limit,
            },
        )

    async def list_agents(self) -> Any:
        return await self._request("/api/v1/agent-channel-runtime/agents/list", {})

    async def request_collaboration(
        self,
        *,
        agent_handle: str,
        request_text: str,
        reason: str | None,
        mode: str,
        thread_root_message_id: str | None,
        reference_message_ids: list[str],
        reference_artifact_ids: list[str],
    ) -> Any:
        return await self._request(
            "/api/v1/agent-channel-runtime/collaboration/request",
            {
                "agent_handle": agent_handle,
                "request_text": request_text,
                "reason": reason,
                "mode": mode,
                "thread_root_message_id": thread_root_message_id,
                "reference_message_ids": reference_message_ids,
                "reference_artifact_ids": reference_artifact_ids,
            },
        )

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


def _format_tool_error(title: str, error: str, *, code: str) -> dict[str, Any]:
    return _format_tool_result(f"{title}_error", {"error": error, "code": code})


async def _run_tool(title: str, operation) -> dict[str, Any]:
    try:
        result = await operation
    except Exception as exc:
        return _format_tool_error(title, str(exc), code="runtime_error")
    return _format_tool_result(title, result)


def create_channel_runtime_mcp_server(
    runtime_client: ChannelRuntimeClient,
) -> McpSdkServerConfig:
    @tool(
        "read_channel_messages",
        "Read full messages or thread replies from the current channel",
        {
            "message_ids": list,
            "thread_root_message_id": str,
            "limit": int,
        },
    )
    async def read_channel_messages(args: dict[str, Any]) -> dict[str, Any]:
        raw_message_ids = args.get("message_ids")
        message_ids = (
            [
                item.strip()
                for item in raw_message_ids
                if isinstance(item, str) and item.strip()
            ]
            if isinstance(raw_message_ids, list)
            else []
        )
        thread_root_message_id = args.get("thread_root_message_id")
        thread_root_message_id = (
            thread_root_message_id.strip()
            if isinstance(thread_root_message_id, str)
            and thread_root_message_id.strip()
            else None
        )
        if not message_ids and thread_root_message_id is None:
            return _format_tool_error(
                "read_channel_messages",
                "message_ids or thread_root_message_id must be provided",
                code="invalid_arguments",
            )
        limit = args.get("limit")
        return await _run_tool(
            "read_channel_messages",
            runtime_client.read_messages(
                message_ids=message_ids,
                thread_root_message_id=thread_root_message_id,
                limit=limit if isinstance(limit, int) else None,
            ),
        )

    @tool(
        "list_channel_agents",
        "List active agents available for collaboration in the current channel",
        {},
    )
    async def list_channel_agents(args: dict[str, Any]) -> dict[str, Any]:
        _ = args
        return await _run_tool("list_channel_agents", runtime_client.list_agents())

    @tool(
        "request_agent_collaboration",
        "Explicitly request collaboration from another active agent in this channel",
        {
            "agent_handle": str,
            "request_text": str,
            "reason": str,
            "mode": str,
            "thread_root_message_id": str,
            "reference_message_ids": list,
            "reference_artifact_ids": list,
        },
    )
    async def request_agent_collaboration(args: dict[str, Any]) -> dict[str, Any]:
        agent_handle = args.get("agent_handle")
        request_text = args.get("request_text")
        if not isinstance(agent_handle, str) or not agent_handle.strip():
            return _format_tool_error(
                "request_agent_collaboration",
                "agent_handle must be a non-empty string",
                code="invalid_arguments",
            )
        if not isinstance(request_text, str) or not request_text.strip():
            return _format_tool_error(
                "request_agent_collaboration",
                "request_text must be a non-empty string",
                code="invalid_arguments",
            )
        mode = args.get("mode")
        mode = mode.strip() if isinstance(mode, str) and mode.strip() else "consult"
        if mode not in {"consult", "handoff"}:
            return _format_tool_error(
                "request_agent_collaboration",
                "mode must be consult or handoff",
                code="invalid_arguments",
            )
        reason = args.get("reason")
        thread_root_message_id = args.get("thread_root_message_id")
        reference_message_ids = args.get("reference_message_ids")
        reference_artifact_ids = args.get("reference_artifact_ids")
        return await _run_tool(
            "request_agent_collaboration",
            runtime_client.request_collaboration(
                agent_handle=agent_handle.strip(),
                request_text=request_text.strip(),
                reason=reason.strip() if isinstance(reason, str) and reason.strip() else None,
                mode=mode,
                thread_root_message_id=(
                    thread_root_message_id.strip()
                    if isinstance(thread_root_message_id, str)
                    and thread_root_message_id.strip()
                    else None
                ),
                reference_message_ids=[
                    item.strip()
                    for item in reference_message_ids
                    if isinstance(item, str) and item.strip()
                ]
                if isinstance(reference_message_ids, list)
                else [],
                reference_artifact_ids=[
                    item.strip()
                    for item in reference_artifact_ids
                    if isinstance(item, str) and item.strip()
                ]
                if isinstance(reference_artifact_ids, list)
                else [],
            ),
        )

    @tool(
        "add_channel_message_reaction",
        "Add an emoji reaction to a message in the current channel",
        {"message_id": str, "emoji": str},
    )
    async def add_channel_message_reaction(args: dict[str, Any]) -> dict[str, Any]:
        message_id = args.get("message_id")
        emoji = args.get("emoji")
        if not isinstance(message_id, str) or not message_id.strip():
            return _format_tool_error(
                "add_channel_message_reaction",
                "message_id must be a non-empty string",
                code="invalid_arguments",
            )
        if not isinstance(emoji, str) or not emoji.strip():
            return _format_tool_error(
                "add_channel_message_reaction",
                "emoji must be a non-empty string",
                code="invalid_arguments",
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
            return _format_tool_error(
                "remove_channel_message_reaction",
                "message_id must be a non-empty string",
                code="invalid_arguments",
            )
        if not isinstance(emoji, str) or not emoji.strip():
            return _format_tool_error(
                "remove_channel_message_reaction",
                "emoji must be a non-empty string",
                code="invalid_arguments",
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
            read_channel_messages,
            list_channel_agents,
            request_agent_collaboration,
            add_channel_message_reaction,
            remove_channel_message_reaction,
        ],
    )
