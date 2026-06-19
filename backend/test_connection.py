import os
from dotenv import load_dotenv
from neo4j import GraphDatabase

# Load env variables from local .env
load_dotenv()

def test_connection():
    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD", "password")
    
    print("=" * 60)
    print("CHRONICLE — NEO4J CONNECTION TESTER")
    print("=" * 60)
    print(f"URI:      {uri}")
    print(f"User:     {user}")
    print(f"Password: {'*' * len(password) if password else 'None'}")
    print("-" * 60)
    
    try:
        print("Initializing driver and verifying connectivity...")
        # Create driver and test connection
        driver = GraphDatabase.driver(uri, auth=(user, password))
        driver.verify_connectivity()
        print("\n[OK] SUCCESS: Connected to Neo4j successfully!")
        
        # Test basic query execution
        with driver.session() as session:
            result = session.run("RETURN 'Hello from Neo4j!' AS message")
            record = result.single()
            print(f"[OK] Query Executed: Database returned -> '{record['message']}'")
            
        driver.close()
    except Exception as e:
        print("\n[ERROR] CONNECTION FAILED!")
        print(f"Error details: {e}")
        
        # Guide the user
        print("\nTroubleshooting tips:")
        if "routing" in str(e).lower():
            print("1. If using AuraDB, try changing the protocol to 'neo4j+ssc://' to bypass certificate checks.")
            print("2. Verify that your AuraDB database is actually running (not paused) in your console.")
        elif "unauthorized" in str(e).lower() or "credentials" in str(e).lower():
            print("1. Double check your password. Note that the AuraDB password is case-sensitive.")
            print("2. Ensure your NEO4J_USER is set to 'neo4j'.")
    print("=" * 60)

if __name__ == "__main__":
    test_connection()
