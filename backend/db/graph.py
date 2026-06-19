import os
from dotenv import load_dotenv
from neo4j import GraphDatabase

# Load env variables
load_dotenv()

_driver = None

def get_driver():
    global _driver
    if _driver is not None:
        return _driver
        
    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD", "password")
    
    try:
        # Create a new driver instance
        _driver = GraphDatabase.driver(uri, auth=(user, password))
        # Quick validation
        _driver.verify_connectivity()
        return _driver
    except Exception as e:
        print(f"Failed to connect to Neo4j database: {e}")
        _driver = None
        return None

def check_connection():
    driver = get_driver()
    if driver is None:
        return False
    try:
        driver.verify_connectivity()
        return True
    except Exception:
        return False

def close_driver():
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None

def init_db():
    driver = get_driver()
    if driver is None:
        raise ConnectionError("Neo4j database is offline or not configured correctly.")
        
    queries = [
        "CREATE CONSTRAINT commit_hash_unique IF NOT EXISTS FOR (c:Commit) REQUIRE c.hash IS UNIQUE",
        "CREATE CONSTRAINT author_email_unique IF NOT EXISTS FOR (a:Author) REQUIRE a.email IS UNIQUE",
        "CREATE CONSTRAINT file_path_unique IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE",
        "CREATE CONSTRAINT repo_path_unique IF NOT EXISTS FOR (r:Repository) REQUIRE r.path IS UNIQUE"
    ]
    
    with driver.session() as session:
        for q in queries:
            try:
                session.run(q)
            except Exception as e:
                print(f"Constraint creation warning: {e}")

def clear_db():
    driver = get_driver()
    if driver is None:
        raise ConnectionError("Neo4j database is offline.")
    with driver.session() as session:
        session.run("MATCH (n) DETACH DELETE n")

def clear_active_repo_data():
    """
    Deletes all commit, author, and file nodes, but preserves the Repository registry nodes.
    """
    driver = get_driver()
    if driver is None:
        raise ConnectionError("Neo4j database is offline.")
    with driver.session() as session:
        session.run("MATCH (n) WHERE NOT n:Repository DETACH DELETE n")

def save_commits_to_graph(commits):
    driver = get_driver()
    if driver is None:
        raise ConnectionError("Neo4j database is offline. Cannot save commits to graph.")
        
    init_db()
    
    query = """
    UNWIND $commits AS commit
    MERGE (a:Author {email: commit.email})
    ON CREATE SET a.name = commit.author
    
    MERGE (c:Commit {hash: commit.hash})
    ON CREATE SET c.message = commit.message,
                  c.date = commit.date,
                  c.insertions = commit.insertions,
                  c.deletions = commit.deletions
                  
    MERGE (a)-[:AUTHORED]->(c)
    
    WITH c, commit
    UNWIND commit.files_changed AS filepath
    MERGE (f:File {path: filepath})
    MERGE (c)-[:MODIFIED]->(f)
    """
    
    with driver.session() as session:
        session.run(query, commits=commits)

def save_repo_metadata(metadata):
    driver = get_driver()
    if driver is None:
        raise ConnectionError("Neo4j database is offline.")
        
    init_db()
    
    query = """
    MATCH (r:Repository) SET r.is_active = false
    WITH count(r) AS dummy
    MERGE (target:Repository {path: $path})
    SET target.name = $name,
        target.ingested_at = $ingested_at,
        target.graph_status = $graph_status,
        target.is_active = true
    """
    
    with driver.session() as session:
        session.run(query, path=metadata["repo_path"], name=metadata["repo_name"], ingested_at=metadata["ingested_at"], graph_status=metadata["graph_status"])

def get_active_repo_metadata():
    driver = get_driver()
    if driver is None:
        return {}
    
    with driver.session() as session:
        result = session.run("MATCH (r:Repository {is_active: true}) RETURN r LIMIT 1")
        record = result.single()
        if record:
            node = record["r"]
            return {
                "repo_name": node.get("name"),
                "repo_path": node.get("path"),
                "ingested_at": node.get("ingested_at"),
                "graph_status": node.get("graph_status")
            }
    return {}

def get_all_repositories():
    driver = get_driver()
    if driver is None:
        return []
        
    with driver.session() as session:
        result = session.run("MATCH (r:Repository) RETURN r ORDER BY r.name ASC")
        repos = []
        for r in result:
            node = r["r"]
            repos.append({
                "repo_name": node.get("name"),
                "repo_path": node.get("path"),
                "ingested_at": node.get("ingested_at"),
                "graph_status": node.get("graph_status"),
                "is_active": int(node.get("is_active", False))
            })
        return repos

def set_active_repository(repo_path):
    driver = get_driver()
    if driver is None:
        raise ConnectionError("Neo4j database is offline.")
        
    with driver.session() as session:
        session.run("MATCH (r:Repository) SET r.is_active = false")
        session.run("MATCH (r:Repository {path: $path}) SET r.is_active = true", path=repo_path)

def get_all_commits():
    driver = get_driver()
    if driver is None:
        return []
        
    query = """
    MATCH (c:Commit)
    OPTIONAL MATCH (a:Author)-[:AUTHORED]->(c)
    OPTIONAL MATCH (c)-[:MODIFIED]->(f:File)
    RETURN c.hash AS hash, a.name AS author, a.email AS email, c.date AS date, c.message AS message,
           c.insertions AS insertions, c.deletions AS deletions, collect(f.path) AS files_changed
    ORDER BY c.date DESC
    """
    
    with driver.session() as session:
        result = session.run(query)
        commits = []
        for r in result:
            commits.append({
                "hash": r["hash"],
                "author": r["author"] or "Unknown",
                "email": r["email"] or "",
                "date": r["date"],
                "message": r["message"] or "",
                "files_changed": r["files_changed"] or [],
                "insertions": r["insertions"] or 0,
                "deletions": r["deletions"] or 0
            })
        return commits

def get_repo_summary():
    driver = get_driver()
    if driver is None:
        return {"total_commits": 0, "total_authors": 0, "unique_files_count": 0}
        
    metadata = get_active_repo_metadata()
    if not metadata:
        return {"total_commits": 0, "total_authors": 0, "unique_files_count": 0}
        
    with driver.session() as session:
        # Total commits
        total_commits = session.run("MATCH (c:Commit) RETURN count(c) AS count").single()["count"]
        
        # Total unique authors
        total_authors = session.run("MATCH (a:Author) RETURN count(a) AS count").single()["count"]
        
        # Top authors
        top_authors_res = session.run("""
            MATCH (a:Author)-[:AUTHORED]->(c:Commit)
            RETURN a.name AS author, count(c) AS count
            ORDER BY count DESC LIMIT 5
        """)
        top_authors = [{"author": r["author"], "count": r["count"]} for r in top_authors_res]
        
        # Top files
        top_files_res = session.run("""
            MATCH (c:Commit)-[:MODIFIED]->(f:File)
            RETURN f.path AS file, count(c) AS changes
            ORDER BY changes DESC LIMIT 10
        """)
        top_files = [{"file": r["file"], "changes": r["changes"]} for r in top_files_res]
        
        # Unique files count
        unique_files_count = session.run("MATCH (f:File) RETURN count(f) AS count").single()["count"]
        
    return {
        "repo_name": metadata.get("repo_name", "Unknown Repo"),
        "repo_path": metadata.get("repo_path", ""),
        "graph_status": metadata.get("graph_status", "Offline"),
        "total_commits": total_commits,
        "total_authors": total_authors,
        "top_authors": top_authors,
        "top_files": top_files,
        "unique_files_count": unique_files_count
    }

def run_cypher_query(query, params=None):
    driver = get_driver()
    if driver is None:
        raise ConnectionError("Neo4j database is offline. Cannot execute Cypher query.")
        
    with driver.session() as session:
        result = session.run(query, params or {})
        return [record.data() for record in result]
