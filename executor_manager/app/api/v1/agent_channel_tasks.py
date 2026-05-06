from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.schemas.response import Response, ResponseSchema
from app.services.backend_client import BackendClient

router = APIRouter(prefix="/agent-channel-tasks", tags=["agent-channel-tasks"])
backend_client = BackendClient()


@router.post("/create", response_model=ResponseSchema[Any])
async def create_agent_channel_task(request: dict[str, Any]) -> JSONResponse:
    session_id = str(request.get("session_id") or "").strip()
    payload = {key: value for key, value in request.items() if key != "session_id"}
    result = await backend_client.create_agent_channel_task(session_id, payload)
    return Response.success(data=result, message="Agent channel task created")


@router.post("/status", response_model=ResponseSchema[Any])
async def update_agent_channel_task_status(request: dict[str, Any]) -> JSONResponse:
    session_id = str(request.get("session_id") or "").strip()
    payload = {key: value for key, value in request.items() if key != "session_id"}
    result = await backend_client.update_agent_channel_task_status(session_id, payload)
    return Response.success(data=result, message="Agent channel task status updated")


@router.post("/claim", response_model=ResponseSchema[Any])
async def claim_agent_channel_task(request: dict[str, Any]) -> JSONResponse:
    session_id = str(request.get("session_id") or "").strip()
    payload = {key: value for key, value in request.items() if key != "session_id"}
    result = await backend_client.claim_agent_channel_task(session_id, payload)
    return Response.success(data=result, message="Agent channel task claimed")


@router.post("/comment", response_model=ResponseSchema[Any])
async def comment_agent_channel_task(request: dict[str, Any]) -> JSONResponse:
    session_id = str(request.get("session_id") or "").strip()
    payload = {key: value for key, value in request.items() if key != "session_id"}
    result = await backend_client.comment_agent_channel_task(session_id, payload)
    return Response.success(data=result, message="Agent channel task commented")
