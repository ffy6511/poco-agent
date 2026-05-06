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

CHANNEL_TASKS_MCP_SERVER_KEY = "__poco_channel_tasks"


class ChannelTaskClient:
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
            raise RuntimeError("Invalid channel task response")
        if body.get("code") != 0:
            raise RuntimeError(str(body.get("message") or "Channel task error"))
        return body.get("data")

    async def create_task(self, *, title: str, description: str | None, priority: str | None) -> Any:
        return await self._request(
            "/api/v1/agent-channel-tasks/create",
            {"title": title, "description": description, "priority": priority},
        )

    async def update_status(self, *, task_id: str, status: str, position: int) -> Any:
        return await self._request(
            "/api/v1/agent-channel-tasks/status",
            {"task_id": task_id, "status": status, "position": position},
        )

    async def claim_task(self, *, task_id: str) -> Any:
        return await self._request(
            "/api/v1/agent-channel-tasks/claim",
            {"task_id": task_id},
        )

    async def comment_on_task(self, *, task_id: str, text: str) -> Any:
        return await self._request(
            "/api/v1/agent-channel-tasks/comment",
            {"task_id": task_id, "text": text},
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


def create_channel_tasks_mcp_server(task_client: ChannelTaskClient) -> McpSdkServerConfig:
    @tool(
        "create_channel_task",
        "Create a structured channel task in the current server channel",
        {"title": str, "description": str, "priority": str},
    )
    async def create_channel_task(args: dict[str, Any]) -> dict[str, Any]:
        title = args.get("title")
        if not isinstance(title, str) or not title.strip():
            return _format_tool_result(
                "create_channel_task_error",
                {"error": "title must be a non-empty string"},
            )
        description = args.get("description")
        priority = args.get("priority")
        return await _run_tool(
            "create_channel_task",
            task_client.create_task(
                title=title.strip(),
                description=description.strip() if isinstance(description, str) else None,
                priority=priority.strip() if isinstance(priority, str) else None,
            ),
        )

    @tool(
        "update_channel_task_status",
        "Update a structured channel task status in the current server channel",
        {"task_id": str, "status": str, "position": int},
    )
    async def update_channel_task_status(args: dict[str, Any]) -> dict[str, Any]:
        task_id = args.get("task_id")
        status = args.get("status")
        if not isinstance(task_id, str) or not task_id.strip():
            return _format_tool_result(
                "update_channel_task_status_error",
                {"error": "task_id must be a non-empty string"},
            )
        if not isinstance(status, str) or not status.strip():
            return _format_tool_result(
                "update_channel_task_status_error",
                {"error": "status must be a non-empty string"},
            )
        position = args.get("position")
        return await _run_tool(
            "update_channel_task_status",
            task_client.update_status(
                task_id=task_id.strip(),
                status=status.strip(),
                position=position if isinstance(position, int) else 0,
            ),
        )

    @tool(
        "claim_channel_task",
        "Claim a structured channel task as the current agent",
        {"task_id": str},
    )
    async def claim_channel_task(args: dict[str, Any]) -> dict[str, Any]:
        task_id = args.get("task_id")
        if not isinstance(task_id, str) or not task_id.strip():
            return _format_tool_result(
                "claim_channel_task_error",
                {"error": "task_id must be a non-empty string"},
            )
        return await _run_tool(
            "claim_channel_task",
            task_client.claim_task(task_id=task_id.strip()),
        )

    @tool(
        "comment_on_channel_task",
        "Post a structured comment to a channel task thread",
        {"task_id": str, "text": str},
    )
    async def comment_on_channel_task(args: dict[str, Any]) -> dict[str, Any]:
        task_id = args.get("task_id")
        text = args.get("text")
        if not isinstance(task_id, str) or not task_id.strip():
            return _format_tool_result(
                "comment_on_channel_task_error",
                {"error": "task_id must be a non-empty string"},
            )
        if not isinstance(text, str) or not text.strip():
            return _format_tool_result(
                "comment_on_channel_task_error",
                {"error": "text must be a non-empty string"},
            )
        return await _run_tool(
            "comment_on_channel_task",
            task_client.comment_on_task(task_id=task_id.strip(), text=text.strip()),
        )

    return create_sdk_mcp_server(
        name="poco-channel-tasks",
        version="0.1.0",
        tools=[
            create_channel_task,
            update_channel_task_status,
            claim_channel_task,
            comment_on_channel_task,
        ],
    )
