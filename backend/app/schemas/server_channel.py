from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ServerChannelVisibility = Literal["public", "private"]


class ServerChannelCreateRequest(BaseModel):
    name: str
    visibility: ServerChannelVisibility = "public"


class ServerChannelResponse(BaseModel):
    channel_id: UUID = Field(validation_alias="id")
    server_id: UUID
    name: str
    slug: str
    visibility: ServerChannelVisibility
    created_by: str | None
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ServerChannelMemberResponse(BaseModel):
    membership_id: int = Field(validation_alias="id")
    channel_id: UUID
    user_id: str
    role: str
    joined_at: datetime
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
