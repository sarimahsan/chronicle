import os
import sys
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

# Ensure the backend directory is in the python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from injestion.injestion import ingest_commits
from db.sql import save_to_db, save_repo_metadata, get_all_commits, get_repo_summary, get_repo_metadata
from llm.llm import query_llm

app = FastAPI(title="Strata API", description="Strata - Repo Intelligence Chatbot Backend")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request bodies
class IngestRequest(BaseModel):
    repo_path_or_url: str
    token: Optional[str] = None

class QueryRequest(BaseModel):
    question: str

@app.post("/api/ingest")
async def ingest_repo(request: IngestRequest):
    db_path = os.getenv("DATABASE_PATH", "repo.db")
    clone_dir = os.getenv("CLONE_DIR", "./cloned_repo")
    
    # Resolve repository name
    repo_path_or_url = request.repo_path_or_url.strip()
    if repo_path_or_url.endswith(".git"):
        repo_name = repo_path_or_url.split("/")[-1].replace(".git", "")
    else:
        repo_name = os.path.basename(repo_path_or_url.rstrip("/\\"))
        
    if not repo_name:
        repo_name = "cloned_repo"
        
    try:
        # Perform commit ingestion
        commits = ingest_commits(repo_path_or_url, local_path=clone_dir, token=request.token)
        
        # Save to SQLite
        save_to_db(commits, db_path=db_path)
        
        # Save repo metadata
        metadata = {
            "repo_name": repo_name,
            "repo_path": repo_path_or_url,
            "ingested_at": os.getenv("CURRENT_TIME", "2026-06-19T22:00:00")
        }
        save_repo_metadata(metadata, db_path=db_path)
        
        # Retrieve stats summary
        summary = get_repo_summary(db_path=db_path)
        return {"status": "success", "message": f"Successfully ingested {len(commits)} commits.", "summary": summary}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

@app.post("/api/query")
async def query_repo(request: QueryRequest):
    db_path = os.getenv("DATABASE_PATH", "repo.db")
    
    # Retrieve all commits from DB
    commits = get_all_commits(db_path=db_path)
    if not commits:
        raise HTTPException(
            status_code=400, 
            detail="No repository ingested yet. Please ingest a repository first."
        )
        
    try:
        answer = query_llm(commits, request.question)
        return {"status": "success", "answer": answer}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query execution failed: {str(e)}")

@app.get("/api/status")
async def get_status():
    db_path = os.getenv("DATABASE_PATH", "repo.db")
    summary = get_repo_summary(db_path=db_path)
    return {"status": "success", "summary": summary}

# Serve frontend static files
frontend_dir = os.path.join(os.path.dirname(backend_dir), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/ui", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    
    @app.get("/")
    async def redirect_to_ui():
        return FileResponse(os.path.join(frontend_dir, "index.html"))
