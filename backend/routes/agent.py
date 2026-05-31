from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import json
import models
import schemas
from database import get_db
from routes.auth import get_current_user
from google import genai

router = APIRouter()

# Initialize the genai client. It will automatically pick up GEMINI_API_KEY from the environment.
client = genai.Client()


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


class AgentResponse(schemas.BaseModel):
    output: str


@router.post("/agent/chat")
def chat_with_agent(
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

    try:
        env = project.environment_id if project.environment_id else "remote"

        kwargs = {
            "agent": "antigravity-preview-05-2026",
            "input": payload.prompt,
            "environment": env,
        }

        if payload.stream:
            kwargs["stream"] = True

        if project.latest_interaction_id:
            kwargs["previous_interaction_id"] = project.latest_interaction_id

        if payload.stream:
            interaction_stream = client.interactions.create(**kwargs)

            def generate():
                try:
                    for chunk in interaction_stream:
                        if chunk.event_type == "interaction.created":
                            project.environment_id = chunk.interaction.environment_id
                            project.latest_interaction_id = chunk.interaction.id
                            db.commit()
                            yield f"data: {json.dumps({'type': 'meta', 'interaction_id': chunk.interaction.id})}\n\n"
                        elif chunk.event_type == "step.delta":
                            if hasattr(chunk.delta, "text") and chunk.delta.text:
                                yield f"data: {json.dumps({'type': 'token', 'content': chunk.delta.text})}\n\n"

                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

            return StreamingResponse(generate(), media_type="text/event-stream")
        else:
            interaction = client.interactions.create(**kwargs)

            project.environment_id = interaction.environment_id
            project.latest_interaction_id = interaction.id
            db.commit()

            return AgentResponse(output=interaction.output_text)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
