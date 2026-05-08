from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.schemas.response import Response, ResponseSchema
from app.services.backend_client import BackendClient

router = APIRouter(
    prefix="/agent-channel-runtime",
    tags=["agent-channel-runtime"],
)
backend_client = BackendClient()


def _split_session_payload(request: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    session_id = str(request.get("session_id") or "").strip()
    payload = {key: value for key, value in request.items() if key != "session_id"}
    return session_id, payload


@router.post("/reactions/add", response_model=ResponseSchema[Any])
async def add_agent_channel_message_reaction(
    request: dict[str, Any],
) -> JSONResponse:
    session_id, payload = _split_session_payload(request)
    result = await backend_client.add_agent_channel_message_reaction(
        session_id,
        payload,
    )
    return Response.success(data=result, message="Agent channel reaction added")


@router.post("/reactions/remove", response_model=ResponseSchema[Any])
async def remove_agent_channel_message_reaction(
    request: dict[str, Any],
) -> JSONResponse:
    session_id, payload = _split_session_payload(request)
    result = await backend_client.remove_agent_channel_message_reaction(
        session_id,
        payload,
    )
    return Response.success(data=result, message="Agent channel reaction removed")
