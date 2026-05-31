from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import models
from database import engine
from routes import auth, agent

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Nurv API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(agent.router, prefix="/api", tags=["agent"])


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
