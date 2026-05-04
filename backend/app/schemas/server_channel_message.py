from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ServerChannelMessageType = Literal["user", "system", "task"]


class ServerChannelMessageCreateRequest(BaseModel):
    content: dict[str, Any]
    text_preview: str | None = None
    message_type: ServerChannelMessageType = "user"
    thread_root_message_id: UUID | None = None


class ServerChannelMessageResponse(BaseModel):
    message_id: UUID = Field(validation_alias="id")
    channel_id: UUID
    author_user_id: str | None
    message_type: ServerChannelMessageType
    content: dict[str, Any]
    text_preview: str | None = None
    thread_root_message_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ServerChannelThreadResponse(BaseModel):
    root: ServerChannelMessageResponse
    replies: list[ServerChannelMessageResponse]
