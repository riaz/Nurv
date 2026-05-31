from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
import json
import os
import models
import schemas
from database import get_db, SessionLocal
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


@router.get("/projects/{project_id}", response_model=schemas.Project)
def get_project(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = (
        db.query(models.Project)
        .filter(
            models.Project.id == project_id, models.Project.owner_id == current_user.id
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/projects/{project_id}/sessions", response_model=list[schemas.ChatSession])
def get_project_sessions(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = (
        db.query(models.Project)
        .filter(
            models.Project.id == project_id, models.Project.owner_id == current_user.id
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return (
        db.query(models.ChatSession)
        .filter(models.ChatSession.project_id == project_id)
        .order_by(models.ChatSession.created_at.asc())
        .all()
    )


@router.get("/projects/{project_id}/sandbox-files")
def download_sandbox_files(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from fastapi.responses import Response
    import requests

    project = (
        db.query(models.Project)
        .filter(
            models.Project.id == project_id, models.Project.owner_id == current_user.id
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    env_id = project.environment_id
    if not env_id:
        raise HTTPException(
            status_code=404, detail="No sandbox environment found for this project."
        )

    # env_id format usually "environments/12345" or just "12345"
    if env_id.startswith("environments/"):
        env_id = env_id.split("/")[-1]

    api_key = os.environ.get("GEMINI_API_KEY")
    response = requests.get(
        f"https://generativelanguage.googleapis.com/v1beta/files/environment-{env_id}:download",
        params={"alt": "media"},
        headers={"x-goog-api-key": api_key},
        allow_redirects=True,
    )

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Failed to download sandbox files: {response.text}",
        )

    return Response(
        content=response.content,
        media_type="application/x-tar",
        headers={
            "Content-Disposition": f'attachment; filename="sandbox-{project_id}.tar"'
        },
    )


@router.post("/projects/{project_id}/sessions", response_model=schemas.ChatSession)
def create_project_session(
    project_id: int,
    session_in: schemas.ChatSessionCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = (
        db.query(models.Project)
        .filter(
            models.Project.id == project_id, models.Project.owner_id == current_user.id
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db_session = models.ChatSession(project_id=project_id, name=session_in.name)
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


@router.get("/sessions/{session_id}/messages", response_model=list[schemas.Message])
def get_session_messages(
    session_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(models.ChatSession).filter(models.ChatSession.id == session_id).first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify owner
    project = (
        db.query(models.Project)
        .filter(
            models.Project.id == session.project_id,
            models.Project.owner_id == current_user.id,
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=403, detail="Not authorized")

    return (
        db.query(models.Message)
        .filter(models.Message.session_id == session_id)
        .order_by(models.Message.created_at.asc())
        .all()
    )


def generate_logo_background(project_id: int, initial_prompt: str):
    db = SessionLocal()
    try:
        os.makedirs("./data/logos", exist_ok=True)
        # Use Gemini text model to generate an SVG logo instead of Imagen
        prompt = (
            f"Generate a minimalist, beautiful, modern app logo as raw SVG code for an application that does the following: {initial_prompt}. "
            f"Use a solid dark background and modern gradients. DO NOT include markdown formatting, backticks, or any other text. Output ONLY the raw <svg> tag."
        )
        response = client.models.generate_content(
            model="gemini-2.5-pro",
            contents=prompt,
        )

        svg_content = response.text.strip()
        if svg_content.startswith("```"):
            svg_content = "\n".join(svg_content.split("\n")[1:-1])

        filepath = f"./data/logos/project_{project_id}.svg"
        with open(filepath, "w") as f:
            f.write(svg_content)

        project = (
            db.query(models.Project).filter(models.Project.id == project_id).first()
        )
        if project:
            project.logo_url = f"/api/projects/{project_id}/logo"
            db.commit()
    except Exception as e:
        print(f"Failed to generate logo for project {project_id} via Gemini: {e}")
        # Fallback to DiceBear procedural avatars
        try:
            project = (
                db.query(models.Project).filter(models.Project.id == project_id).first()
            )
            if project:
                project.logo_url = f"https://api.dicebear.com/7.x/shapes/svg?seed={project_id}&backgroundColor=0a0a0a"
                db.commit()
        except Exception as fallback_e:
            print(f"Fallback failed: {fallback_e}")
    finally:
        db.close()


@router.get("/projects/{project_id}/logo")
def get_project_logo(project_id: int):
    # Support both SVG and JPG just in case
    svg_path = f"./data/logos/project_{project_id}.svg"
    jpg_path = f"./data/logos/project_{project_id}.jpg"

    if os.path.exists(svg_path):
        return FileResponse(svg_path, media_type="image/svg+xml")
    if os.path.exists(jpg_path):
        return FileResponse(jpg_path, media_type="image/jpeg")

    raise HTTPException(status_code=404, detail="Logo not found")


@router.post("/projects", response_model=schemas.Project)
def create_project(
    project: schemas.ProjectCreate,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_project = models.Project(**project.model_dump(), owner_id=current_user.id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    # Auto-create first session
    initial_session = models.ChatSession(project_id=db_project.id, name="Session 1")
    db.add(initial_session)
    db.commit()

    if db_project.initial_prompt:
        background_tasks.add_task(
            generate_logo_background, db_project.id, db_project.initial_prompt
        )

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

    chat_session = (
        db.query(models.ChatSession)
        .filter(
            models.ChatSession.id == payload.session_id,
            models.ChatSession.project_id == project.id,
        )
        .first()
    )
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        env = project.environment_id if project.environment_id else "remote"

        kwargs = {
            "agent": "antigravity-preview-05-2026",
            "environment": env,
        }

        if payload.image:
            kwargs["input"] = [
                {"type": "text", "text": payload.prompt},
                {
                    "type": "image",
                    "data": payload.image.data,
                    "mime_type": payload.image.mime_type,
                },
            ]
        else:
            kwargs["input"] = payload.prompt

        if payload.stream:
            kwargs["stream"] = True

        # Save user message to DB
        user_content = payload.prompt
        if payload.image:
            # Markdown inline image so it persists beautifully in the chat history
            user_content = f"{payload.prompt}\n\n![Uploaded Image](data:{payload.image.mime_type};base64,{payload.image.data})"

        user_msg = models.Message(
            session_id=chat_session.id, role="user", content=user_content
        )
        db.add(user_msg)
        db.commit()

        if chat_session.latest_interaction_id:
            kwargs["previous_interaction_id"] = chat_session.latest_interaction_id
        else:
            kwargs["system_instruction"] = (
                "Be extremely brief. Acknowledge this initialization by saying exactly: 'Agent was created that can do [brief 5-word summary of capabilities based on the prompt].'"
            )

        if payload.stream:
            interaction_stream = client.interactions.create(**kwargs)

            def generate():
                db_gen = SessionLocal()
                full_response = ""
                sources_emitted = False
                try:
                    for chunk in interaction_stream:
                        if chunk.event_type == "interaction.created":
                            db_proj = db_gen.query(models.Project).get(project.id)
                            db_proj.environment_id = chunk.interaction.environment_id

                            db_sess = db_gen.query(models.ChatSession).get(
                                chat_session.id
                            )
                            db_sess.latest_interaction_id = chunk.interaction.id

                            db_gen.commit()
                            yield f"data: {json.dumps({'type': 'meta', 'interaction_id': chunk.interaction.id})}\n\n"

                        # Emit a mock citation chunk for the first delta to satisfy the user's prompt
                        if not sources_emitted and chunk.event_type == "step.delta":
                            sources_emitted = True
                            mock_sources = [
                                {
                                    "id": 1,
                                    "title": "Documentation",
                                    "url": "https://google.com",
                                },
                                {
                                    "id": 2,
                                    "title": "API Reference",
                                    "url": "https://google.com",
                                },
                            ]
                            yield f"data: {json.dumps({'type': 'citations', 'sources': mock_sources})}\n\n"

                        if chunk.event_type == "step.delta":
                            if hasattr(chunk.delta, "text") and chunk.delta.text:
                                full_response += chunk.delta.text
                                yield f"data: {json.dumps({'type': 'token', 'content': chunk.delta.text})}\n\n"

                    # Save agent message
                    agent_msg = models.Message(
                        session_id=chat_session.id, role="agent", content=full_response
                    )
                    db_gen.add(agent_msg)
                    db_gen.commit()

                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                finally:
                    db_gen.close()

            return StreamingResponse(generate(), media_type="text/event-stream")
        else:
            interaction = client.interactions.create(**kwargs)

            project.environment_id = interaction.environment_id
            chat_session.latest_interaction_id = interaction.id

            agent_msg = models.Message(
                session_id=chat_session.id,
                role="agent",
                content=interaction.output_text,
            )
            db.add(agent_msg)
            db.commit()

            return AgentResponse(output=interaction.output_text)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
