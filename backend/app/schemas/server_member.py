from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ServerRole = Literal["owner", "admin", "member"]


class ServerMemberRoleUpdateRequest(BaseModel):
    role: ServerRole


class ServerMemberResponse(BaseModel):
    membership_id: int = Field(validation_alias="id")
    server_id: UUID
    user_id: str
    role: ServerRole
    joined_at: datetime
    invited_by: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
