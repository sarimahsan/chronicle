import git
import os
import shutil
from datetime import datetime

def ingest_commits(repo_path_or_url, local_path="./cloned_repo", token=None):
    """
    Ingests commits from a local directory or clones a remote repository.
    Supports GitHub PAT token authorization.
    """
    if repo_path_or_url.startswith("http://") or repo_path_or_url.startswith("https://") or repo_path_or_url.startswith("git@"):
        # If PAT is provided, inject it into the HTTPS URL
        url = repo_path_or_url
        if token and "github.com" in url and not url.startswith("git@"):
            # Ensure it is https://
            if url.startswith("https://"):
                url = url.replace("https://", f"https://{token}@")
            elif url.startswith("http://"):
                url = url.replace("http://", f"http://{token}@")

        if os.path.exists(local_path):
            try:
                # Try loading existing repo and pull
                repo = git.Repo(local_path)
                origin = repo.remotes.origin
                origin.pull()
            except Exception:
                # If loading/pulling fails, clean directory and clone fresh
                shutil.rmtree(local_path)
                repo = git.Repo.clone_from(url, local_path)
        else:
            repo = git.Repo.clone_from(url, local_path)
    else:
        # Local repository path
        resolved_path = os.path.abspath(repo_path_or_url)
        if not os.path.exists(resolved_path):
            raise FileNotFoundError(f"Local repository path does not exist: {resolved_path}")
        repo = git.Repo(resolved_path)

    commits = []
    # Fetch commits
    for commit in repo.iter_commits():
        # Safeguard if commit.stats throws error (can happen in empty/corrupted repos)
        try:
            files_changed = list(commit.stats.files.keys())
            insertions = commit.stats.total["insertions"]
            deletions = commit.stats.total["deletions"]
        except Exception:
            files_changed = []
            insertions = 0
            deletions = 0

        commits.append({
            "hash": commit.hexsha,
            "author": commit.author.name,
            "email": commit.author.email,
            "date": datetime.fromtimestamp(commit.committed_date).isoformat(),
            "message": commit.message.strip(),
            "files_changed": files_changed,
            "insertions": insertions,
            "deletions": deletions,
        })
    return commits
