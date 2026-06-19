import git
import os
from datetime import datetime

def get_commit_diff(repo_path, commit_hash, max_lines=200):
    """
    Retrieves the code diff patch for a specific commit hash.
    Binds the output lines count per file to prevent LLM context overflows.
    """
    resolved_path = os.path.abspath(repo_path)
    if not os.path.exists(resolved_path):
        raise FileNotFoundError(f"Repository path does not exist: {resolved_path}")
        
    repo = git.Repo(resolved_path)
    
    try:
        commit = repo.commit(commit_hash)
    except Exception:
        raise ValueError(f"Commit hash '{commit_hash}' not found in repository.")
        
    # Get comparison diff
    if commit.parents:
        diffs = commit.parents[0].diff(commit, create_patch=True)
    else:
        diffs = commit.diff(git.NULL_TREE, create_patch=True)
        
    diff_data = []
    for d in diffs:
        # File paths
        file_path = d.b_path if d.b_path else d.a_path
        
        # Extract patch string
        try:
            patch_raw = d.diff.decode('utf-8', errors='ignore') if d.diff else ''
        except Exception:
            patch_raw = '[Binary or Unreadable file change]'
            
        # Truncate long patches for safety
        lines = patch_raw.split('\n')
        if len(lines) > max_lines:
            patch = '\n'.join(lines[:max_lines]) + f"\n\n... [Diff truncated, total {len(lines)} lines]"
        else:
            patch = patch_raw
            
        diff_data.append({
            "file": file_path,
            "change_type": d.change_type,  # 'A' (Add), 'M' (Modify), 'D' (Delete), 'R' (Rename)
            "patch": patch
        })
        
    return {
        "hash": commit.hexsha,
        "author": commit.author.name,
        "email": commit.author.email,
        "date": datetime.fromtimestamp(commit.committed_date).isoformat(),
        "message": commit.message.strip(),
        "diffs": diff_data
    }
