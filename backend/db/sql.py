import sqlite3
import json
import os

def get_db_connection(db_path="repo.db"):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def save_to_db(commits, db_path="repo.db"):
    conn = get_db_connection(db_path)
    # Ensure tables exist
    conn.execute("""CREATE TABLE IF NOT EXISTS commits (
        hash TEXT PRIMARY KEY, 
        author TEXT, 
        email TEXT, 
        date TEXT,
        message TEXT, 
        files_changed TEXT, 
        insertions INT, 
        deletions INT
    )""")
    
    # Store repository metadata (e.g. current active repo name/path)
    conn.execute("""CREATE TABLE IF NOT EXISTS repo_info (
        key TEXT PRIMARY KEY,
        value TEXT
    )""")

    for c in commits:
        conn.execute(
            "INSERT OR REPLACE INTO commits VALUES (?,?,?,?,?,?,?,?)",
            (
                c["hash"], 
                c["author"], 
                c["email"], 
                c["date"], 
                c["message"],
                json.dumps(c["files_changed"]), 
                c["insertions"], 
                c["deletions"]
            )
        )
    conn.commit()
    conn.close()

def save_repo_metadata(metadata, db_path="repo.db"):
    conn = get_db_connection(db_path)
    for k, v in metadata.items():
        conn.execute("INSERT OR REPLACE INTO repo_info VALUES (?, ?)", (k, str(v)))
    conn.commit()
    conn.close()

def get_repo_metadata(db_path="repo.db"):
    if not os.path.exists(db_path):
        return {}
    conn = get_db_connection(db_path)
    cursor = conn.execute("SELECT key, value FROM repo_info")
    rows = cursor.fetchall()
    conn.close()
    return {row["key"]: row["value"] for row in rows}

def get_all_commits(db_path="repo.db"):
    if not os.path.exists(db_path):
        return []
    conn = get_db_connection(db_path)
    cursor = conn.execute("SELECT * FROM commits ORDER BY date DESC")
    rows = cursor.fetchall()
    conn.close()
    
    commits = []
    for r in rows:
        commits.append({
            "hash": r["hash"],
            "author": r["author"],
            "email": r["email"],
            "date": r["date"],
            "message": r["message"],
            "files_changed": json.loads(r["files_changed"]),
            "insertions": r["insertions"],
            "deletions": r["deletions"]
        })
    return commits

def get_repo_summary(db_path="repo.db"):
    if not os.path.exists(db_path):
        return {"total_commits": 0, "total_authors": 0, "files_changed_count": 0}
        
    conn = get_db_connection(db_path)
    
    # Total commits
    total_commits = conn.execute("SELECT count(*) FROM commits").fetchone()[0]
    
    # Total unique authors
    total_authors = conn.execute("SELECT count(distinct author) FROM commits").fetchone()[0]
    
    # Top authors
    cursor = conn.execute("SELECT author, count(*) as count FROM commits GROUP BY author ORDER BY count DESC LIMIT 5")
    top_authors = [{"author": r["author"], "count": r["count"]} for r in cursor.fetchall()]
    
    # Get all commits to process file stats
    cursor = conn.execute("SELECT files_changed FROM commits")
    all_files = {}
    for r in cursor.fetchall():
        try:
            files = json.loads(r["files_changed"])
            for f in files:
                all_files[f] = all_files.get(f, 0) + 1
        except Exception:
            continue
            
    sorted_files = sorted(all_files.items(), key=lambda x: x[1], reverse=True)
    top_files = [{"file": f, "changes": c} for f, c in sorted_files[:10]]
    
    conn.close()
    
    metadata = get_repo_metadata(db_path)
    
    return {
        "repo_name": metadata.get("repo_name", "Unknown Repo"),
        "repo_path": metadata.get("repo_path", ""),
        "total_commits": total_commits,
        "total_authors": total_authors,
        "top_authors": top_authors,
        "top_files": top_files,
        "unique_files_count": len(all_files)
    }