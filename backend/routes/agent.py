from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import models
import schemas
from database import get_db
from routes.auth import get_current_user
import json
import os
from google.antigravity import Agent, LocalAgentConfig

router = APIRouter()

# Directory to persist agent conversations
AGENT_SAVE_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "agent_states"
)
os.makedirs(AGENT_SAVE_DIR, exist_ok=True)


@router.get("/projects", response_model=list[schemas.Project])
def get_projects(
    current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return (
        db.query(models.Project)
        .filter(models.Project.owner_id == current_user.id)
        .all()
    )


@router.post("/projects", response_model=schemas.Project)
def create_project(
    project: schemas.ProjectCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_project = models.Project(**project.model_dump(), owner_id=current_user.id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.post("/agent/chat")
async def chat_with_agent(
    payload: schemas.AgentPrompt,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = (
        db.query(models.Project)
        .filter(
            models.Project.id == payload.project_id,
            models.Project.owner_id == current_user.id,
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    async def stream_agent_response():
        config_kwargs = {"save_dir": AGENT_SAVE_DIR}
        if payload.conversation_id:
            config_kwargs["conversation_id"] = payload.conversation_id

        try:
            config = LocalAgentConfig(**config_kwargs)
            async with Agent(config) as agent:
                # Send the initial meta event with the conversation ID so the client can save it
                conv_id = agent.conversation_id
                yield f"data: {json.dumps({'type': 'meta', 'conversation_id': conv_id})}\n\n"

                response = await agent.chat(payload.prompt)
                async for token in response:
                    # Stream tokens one by one
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

                yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(stream_agent_response(), media_type="text/event-stream")
