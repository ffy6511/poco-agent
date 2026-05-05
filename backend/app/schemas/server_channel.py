from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ServerChannelVisibility = Literal["public", "private"]
ServerConversationType = Literal["channel", "direct_message"]


class ServerChannelCreateRequest(BaseModel):
    name: str
    visibility: ServerChannelVisibility = "public"


class ServerChannelUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None


class ServerChannelMemberAddRequest(BaseModel):
    user_id: str
    role: str = "member"


class DirectMessageCreateRequest(BaseModel):
    target_user_id: str | None = None
    target_agent_identity_id: UUID | None = None


class ServerChannelResponse(BaseModel):
    channel_id: UUID = Field(validation_alias="id")
    server_id: UUID
    name: str
    slug: str
    description: str | None = None
    conversation_type: ServerConversationType
    visibility: ServerChannelVisibility
    direct_user_id: str | None = None
    direct_agent_identity_id: UUID | None = None
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
