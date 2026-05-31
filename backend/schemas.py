from pydantic import BaseModel
from typing import Optional, Dict, Any
import datetime


class UserBase(BaseModel):
    email: str


class UserCreate(UserBase):
    pass


class User(UserBase):
    id: int

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    name: str
    initial_prompt: Optional[str] = None
    logo_url: Optional[str] = None
    agent_config: Optional[Dict[str, Any]] = None


class ProjectCreate(ProjectBase):
    pass


class Project(ProjectBase):
    id: int
    owner_id: int
    environment_id: Optional[str] = None
    initial_prompt: Optional[str] = None
    logo_url: Optional[str] = None
    agent_config: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class ChatSessionBase(BaseModel):
    name: str


class ChatSessionCreate(ChatSessionBase):
    pass


class ChatSession(ChatSessionBase):
    id: int
    project_id: int
    latest_interaction_id: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class MessageBase(BaseModel):
    role: str
    content: str


class MessageCreate(MessageBase):
    pass


class Message(MessageBase):
    id: int
    session_id: int
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


class ImageAttachment(BaseModel):
    data: str
    mime_type: str


class AgentPrompt(BaseModel):
    prompt: str
    project_id: int
    session_id: int
    stream: bool = True
    image: Optional[ImageAttachment] = None
