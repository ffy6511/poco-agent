import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.response import Response, ResponseSchema
from app.schemas.server_channel_message import (
    ServerChannelMessageCreateRequest,
    ServerChannelMessageResponse,
    ServerChannelThreadResponse,
)
from app.services.server_channel_message_service import (
    ServerChannelMessageService,
)

router = APIRouter(
    prefix="/servers/{server_id}/channels/{channel_id}",
    tags=["server-channel-messages"],
)

service = ServerChannelMessageService()


@router.get("/messages", response_model=ResponseSchema[list[ServerChannelMessageResponse]])
async def list_channel_messages(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    before_message_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    result = service.list_messages(
        db,
        current_user,
        server_id,
        channel_id,
        before_message_id=before_message_id,
        limit=limit,
    )
    return Response.success(
        data=result,
        message="Server channel messages retrieved successfully",
    )


@router.post("/messages", response_model=ResponseSchema[ServerChannelMessageResponse])
async def send_channel_message(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    request: ServerChannelMessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    result = service.send_message(db, current_user, server_id, channel_id, request)
    return Response.success(
        data=result,
        message="Server channel message sent successfully",
    )


@router.get(
    "/threads/{thread_root_message_id}",
    response_model=ResponseSchema[ServerChannelThreadResponse],
)
async def get_channel_thread(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    thread_root_message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    result = service.get_thread(
        db,
        current_user,
        server_id,
        channel_id,
        thread_root_message_id,
    )
    return Response.success(
        data=result,
        message="Server channel thread retrieved successfully",
    )
