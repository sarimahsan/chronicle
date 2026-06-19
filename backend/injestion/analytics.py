import git
import os

def calculate_codebase_insights(repo_path, max_commits=200):
    """
    Computes precise file-level churn (insertions + deletions) and
    identifies single-author risk ("Bus Factor") across the repo.
    Limits analysis to the last `max_commits` for quick local execution.
    """
    resolved_path = os.path.abspath(repo_path)
    if not os.path.exists(resolved_path):
        raise FileNotFoundError(f"Repository path does not exist: {resolved_path}")
        
    repo = git.Repo(resolved_path)
    
    file_metrics = {}
    total_analyzed = 0
    
    # Process commit history from newest to oldest
    for commit in repo.iter_commits():
        if total_analyzed >= max_commits:
            break
            
        author = commit.author.name
        
        try:
            # commit.stats.files structure: { "filepath": { "insertions": X, "deletions": Y, "lines": Z } }
            stats = commit.stats.files
            for filepath, stat in stats.items():
                # Filter out system or lock files if needed, keep standard code files
                if "node_modules/" in filepath or ".venv/" in filepath or "dist/" in filepath:
                    continue
                    
                if filepath not in file_metrics:
                    file_metrics[filepath] = {
                        "file": filepath,
                        "commits_count": 0,
                        "insertions": 0,
                        "deletions": 0,
                        "authors": set()
                    }
                    
                file_metrics[filepath]["commits_count"] += 1
                file_metrics[filepath]["insertions"] += stat.get("insertions", 0)
                file_metrics[filepath]["deletions"] += stat.get("deletions", 0)
                file_metrics[filepath]["authors"].add(author)
                
            total_analyzed += 1
        except Exception:
            # Skip commits that fail to diff (e.g. initial or corrupt merge commits)
            continue
            
    # Process metrics
    churn_list = []
    bus_factor_risk = []
    
    for filepath, metrics in file_metrics.items():
        total_lines_changed = metrics["insertions"] + metrics["deletions"]
        unique_authors = list(metrics["authors"])
        
        entry = {
            "file": filepath,
            "commits_count": metrics["commits_count"],
            "insertions": metrics["insertions"],
            "deletions": metrics["deletions"],
            "total_churn": total_lines_changed,
            "authors_count": len(unique_authors),
            "authors": unique_authors
        }
        
        churn_list.append(entry)
        
        # Single-Author Risk: File has been changed in at least 2 commits, but only 1 author has ever modified it.
        if len(unique_authors) == 1 and metrics["commits_count"] >= 2:
            bus_factor_risk.append(entry)
            
    # Sort churn list by total lines changed descending
    churn_list = sorted(churn_list, key=lambda x: x["total_churn"], reverse=True)
    
    # Sort bus factor risk by modifications count descending
    bus_factor_risk = sorted(bus_factor_risk, key=lambda x: x["commits_count"], reverse=True)
    
    return {
        "churn": churn_list[:15],          # Top 15 high-churn files
        "bus_factor_risk": bus_factor_risk[:15]  # Top 15 single-author risk files
    }
