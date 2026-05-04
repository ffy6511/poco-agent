import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.response import Response, ResponseSchema
from app.schemas.server_channel import (
    ServerChannelCreateRequest,
    ServerChannelMemberResponse,
    ServerChannelResponse,
)
from app.services.server_channel_service import ServerChannelService

router = APIRouter(prefix="/servers/{server_id}/channels", tags=["server-channels"])

service = ServerChannelService()


@router.get("", response_model=ResponseSchema[list[ServerChannelResponse]])
async def list_server_channels(
    server_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    result = service.list_channels(db, current_user, server_id)
    return Response.success(
        data=result,
        message="Server channels retrieved successfully",
    )


@router.post("", response_model=ResponseSchema[ServerChannelResponse])
async def create_server_channel(
    server_id: uuid.UUID,
    request: ServerChannelCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    result = service.create_channel(db, current_user, server_id, request)
    return Response.success(data=result, message="Server channel created successfully")


@router.post("/{channel_id}/archive", response_model=ResponseSchema[ServerChannelResponse])
async def archive_server_channel(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    result = service.archive_channel(db, current_user, server_id, channel_id)
    return Response.success(
        data=result,
        message="Server channel archived successfully",
    )


@router.post("/{channel_id}/join", response_model=ResponseSchema[ServerChannelMemberResponse])
async def join_server_channel(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    result = service.join_channel(db, current_user, server_id, channel_id)
    return Response.success(
        data=result,
        message="Server channel joined successfully",
    )


@router.post("/{channel_id}/leave", response_model=ResponseSchema[dict])
async def leave_server_channel(
    server_id: uuid.UUID,
    channel_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    service.leave_channel(db, current_user, server_id, channel_id)
    return Response.success(
        data={"channel_id": channel_id},
        message="Server channel left successfully",
    )
