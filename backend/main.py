import os
import sys
import re
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List

# Ensure the backend directory is in the python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from injestion.injestion import ingest_commits
from injestion.diff_viewer import get_commit_diff
from injestion.analytics import calculate_codebase_insights
from db.graph import (
    save_commits_to_graph, check_connection, clear_db, clear_active_repo_data,
    save_repo_metadata, get_active_repo_metadata, get_all_repositories,
    set_active_repository, get_all_commits, get_repo_summary
)
from llm.llm import query_llm
from llm.cypher_agent import query_graph_agent

app = FastAPI(title="Chronicle API", description="Chronicle - Repo Intelligence Chatbot Backend")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def resolve_repo_path(metadata):
    repo_path = metadata.get("repo_path")
    if not repo_path:
        return ""
    if repo_path.startswith("http://") or repo_path.startswith("https://") or repo_path.startswith("git@"):
        # Generate a safe folder name from URL under cloned_repos/
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', repo_path.split("/")[-1].replace(".git", ""))
        return os.path.join(os.getenv("CLONE_DIR_BASE", "./cloned_repos"), safe_name)
    return repo_path

# Pydantic Request Models
class IngestRequest(BaseModel):
    repo_path_or_url: str = Field(..., description="Local directory path or git URL to ingest.")
    token: Optional[str] = Field(None, description="GitHub Personal Access Token for private repositories.")

class QueryRequest(BaseModel):
    question: str = Field(..., description="The query to ask the chatbot.")

class SelectRequest(BaseModel):
    repo_path: str = Field(..., description="The path of the repository to make active.")

# Pydantic Response Sub-Models
class AuthorCommitCount(BaseModel):
    author: str
    count: int

class FileChangeCount(BaseModel):
    file: str
    changes: int

class RepoSummary(BaseModel):
    repo_name: str
    repo_path: str
    graph_status: str
    total_commits: int
    total_authors: int
    top_authors: List[AuthorCommitCount]
    top_files: List[FileChangeCount]
    unique_files_count: int

class RepositoryItem(BaseModel):
    repo_name: str
    repo_path: str
    ingested_at: str
    graph_status: str
    is_active: bool

class DiffFileItem(BaseModel):
    file: str
    change_type: str
    patch: str

class CommitDiffDetails(BaseModel):
    hash: str
    author: str
    email: str
    date: str
    message: str
    diffs: List[DiffFileItem]

class ChurnFileItem(BaseModel):
    file: str
    commits_count: int
    insertions: int
    deletions: int
    total_churn: int
    authors_count: int
    authors: List[str]

class AnalyticsDetails(BaseModel):
    churn: List[ChurnFileItem]
    bus_factor_risk: List[ChurnFileItem]

# Pydantic Endpoint Response Models
class IngestResponse(BaseModel):
    status: str
    message: str
    summary: RepoSummary

class QueryResponse(BaseModel):
    status: str
    answer: str

class StatusResponse(BaseModel):
    status: str
    summary: RepoSummary

class DiffResponse(BaseModel):
    status: str
    diff: CommitDiffDetails

class AnalyticsResponse(BaseModel):
    status: str
    analytics: AnalyticsDetails

class RepositoriesResponse(BaseModel):
    status: str
    repositories: List[RepositoryItem]

class SelectResponse(BaseModel):
    status: str
    message: str
    summary: RepoSummary


@app.post("/api/ingest", response_model=IngestResponse)
async def ingest_repo(request: IngestRequest):
    # Resolve repository name
    repo_path_or_url = request.repo_path_or_url.strip()
    if repo_path_or_url.endswith(".git"):
        repo_name = repo_path_or_url.split("/")[-1].replace(".git", "")
    else:
        repo_name = os.path.basename(repo_path_or_url.rstrip("/\\"))
        
    if not repo_name:
        repo_name = "cloned_repo"
        
    # Determine clone path for remote repository
    if repo_path_or_url.startswith("http://") or repo_path_or_url.startswith("https://") or repo_path_or_url.startswith("git@"):
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', repo_path_or_url.split("/")[-1].replace(".git", ""))
        clone_dir = os.path.join(os.getenv("CLONE_DIR_BASE", "./cloned_repos"), safe_name)
    else:
        clone_dir = repo_path_or_url
        
    try:
        # Perform commit ingestion
        commits = ingest_commits(repo_path_or_url, local_path=clone_dir, token=request.token)
        
        # Save to Neo4j Graph (Clear active repo commits, preserve repository nodes)
        graph_status = "Skipped (Neo4j Offline)"
        try:
            if check_connection():
                clear_active_repo_data()
                save_commits_to_graph(commits)
                graph_status = "Saved to Graph"
        except Exception as ge:
            print(f"Graph database ingestion warning: {ge}")
            graph_status = f"Failed: {ge}"
        
        # Save repo metadata to Neo4j
        metadata = {
            "repo_name": repo_name,
            "repo_path": repo_path_or_url,
            "ingested_at": datetime.now().isoformat(),
            "graph_status": graph_status
        }
        save_repo_metadata(metadata)
        
        # Retrieve stats summary
        summary = get_repo_summary()
        return {
            "status": "success", 
            "message": f"Successfully ingested {len(commits)} commits. Graph status: {graph_status}", 
            "summary": summary
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

@app.post("/api/query", response_model=QueryResponse)
async def query_repo(request: QueryRequest):
    # Retrieve active repo metadata
    repo_metadata = get_active_repo_metadata()
    if not repo_metadata:
        raise HTTPException(
            status_code=400, 
            detail="No repository ingested yet. Please ingest a repository first."
        )
        
    # Check if a commit hash is referenced in the question (7 to 40 hex chars)
    hash_match = re.search(r'\b([0-9a-f]{7,40})\b', request.question.lower())
    diff_context = ""
    if hash_match:
        ref_hash = hash_match.group(1)
        try:
            repo_path = resolve_repo_path(repo_metadata)
            diff_info = get_commit_diff(repo_path, ref_hash)
            
            diff_files = []
            for d in diff_info["diffs"]:
                diff_files.append(f"File: {d['file']} ({d['change_type']})\nPatch:\n{d['patch']}")
            
            diff_context = (
                f"\n\n--- COMMIT INSPECTOR ---\n"
                f"The user is asking about commit {ref_hash}.\n"
                f"Commit Details:\n"
                f"Hash: {diff_info['hash']}\n"
                f"Author: {diff_info['author']} <{diff_info['email']}>\n"
                f"Date: {diff_info['date']}\n"
                f"Message: {diff_info['message']}\n\n"
                f"Changes diff patch:\n"
                + "\n\n".join(diff_files)
                + "\n-------------------------\n"
            )
        except Exception as de:
            print(f"Diff inspection warning: {de}")
            
    final_question = request.question + diff_context

    try:
        if not check_connection():
            raise HTTPException(
                status_code=503,
                detail="Neo4j graph database is currently offline. Fallback disabled."
            )
        answer = query_graph_agent(final_question)
        return {"status": "success", "answer": answer}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph query execution failed: {str(e)}")

@app.get("/api/status", response_model=StatusResponse)
async def get_status():
    summary = get_repo_summary()
    return {"status": "success", "summary": summary}

@app.get("/api/commit/{commit_hash}/diff", response_model=DiffResponse)
async def get_diff(commit_hash: str):
    metadata = get_active_repo_metadata()
    repo_path = resolve_repo_path(metadata)
    try:
        diff_info = get_commit_diff(repo_path, commit_hash)
        return {"status": "success", "diff": diff_info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics", response_model=AnalyticsResponse)
async def get_analytics():
    metadata = get_active_repo_metadata()
    repo_path = resolve_repo_path(metadata)
    try:
        insights = calculate_codebase_insights(repo_path)
        return {"status": "success", "analytics": insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/repositories", response_model=RepositoriesResponse)
async def list_repos():
    repos = get_all_repositories()
    return {"status": "success", "repositories": repos}

@app.post("/api/repositories/select", response_model=SelectResponse)
async def select_repo(request: SelectRequest):
    repo_path = request.repo_path
    try:
        # 1. Update the active repository in Neo4j
        set_active_repository(repo_path)
        
        # 2. Get active repo metadata and path
        metadata = get_active_repo_metadata()
        resolved_path = resolve_repo_path(metadata)
        
        # 3. Re-read/Ingest commits from the local path or cloned path
        commits = ingest_commits(metadata["repo_path"], local_path=resolved_path)
        
        # 4. Clear active repo commits, preserve repository nodes
        graph_status = "Offline"
        if check_connection():
            try:
                clear_active_repo_data()
                save_commits_to_graph(commits)
                graph_status = "Saved to Graph"
            except Exception as ge:
                print(f"Failed to sync Neo4j graph: {ge}")
                graph_status = f"Failed: {ge}"
                
        # Update repository graph status in Neo4j
        metadata["graph_status"] = graph_status
        save_repo_metadata(metadata)
        
        summary = get_repo_summary()
        return {
            "status": "success",
            "message": f"Switched active repository to {metadata.get('repo_name')}",
            "summary": summary
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to switch repository: {str(e)}")

# Serve frontend static files
frontend_dir = os.path.join(os.path.dirname(backend_dir), "frontend", "dist")
if not os.path.exists(frontend_dir):
    frontend_dir = os.path.join(os.path.dirname(backend_dir), "frontend")

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
