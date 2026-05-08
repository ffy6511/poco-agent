import uuid
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_internal_token
from app.schemas.response import Response, ResponseSchema
from app.schemas.server_channel_message_reaction import (
    AgentChannelMessageReactionRequest,
)
from app.services.server_channel_message_reaction_service import (
    ServerChannelMessageReactionService,
)

router = APIRouter(prefix="/internal/channel-runtime", tags=["internal"])
service = ServerChannelMessageReactionService()


@router.post("/reactions/add", response_model=ResponseSchema[Any])
async def add_channel_message_reaction_internal(
    request: AgentChannelMessageReactionRequest,
    session_id: uuid.UUID,
    _: None = Depends(require_internal_token),
    db: Session = Depends(get_db),
) -> JSONResponse:
    result = service.add_agent_reaction(
        db,
        session_id=session_id,
        message_id=request.message_id,
        emoji=request.emoji,
    )
    return Response.success(data=result, message="Agent channel reaction added")


@router.post("/reactions/remove", response_model=ResponseSchema[Any])
async def remove_channel_message_reaction_internal(
    request: AgentChannelMessageReactionRequest,
    session_id: uuid.UUID,
    _: None = Depends(require_internal_token),
    db: Session = Depends(get_db),
) -> JSONResponse:
    result = service.remove_agent_reaction(
        db,
        session_id=session_id,
        message_id=request.message_id,
        emoji=request.emoji,
    )
    return Response.success(data=result, message="Agent channel reaction removed")
