import os
import re
import json
from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel, Field
from db.graph import run_cypher_query, check_connection

load_dotenv()

class CypherResponse(BaseModel):
    cypher: str = Field(description="The executable Neo4j Cypher query.")

def get_groq_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
         raise ValueError("GROQ_API_KEY is not set.")
    return Groq(api_key=api_key)

# The Neo4j database schema description
SCHEMA_DESCRIPTION = """
Nodes:
1. Author {name: STRING, email: STRING} - Represents a git commit author.
2. Commit {hash: STRING, message: STRING, date: STRING, insertions: INTEGER, deletions: INTEGER} - Represents a git commit.
3. File {path: STRING} - Represents a file modified in a commit.

Relationships:
- (a:Author)-[:AUTHORED]->(c:Commit) - Represents an author writing a commit.
- (c:Commit)-[:MODIFIED {insertions: INTEGER, deletions: INTEGER}]->(f:File) - Represents a commit changing a file.
"""

CYPHER_GENERATION_PROMPT = """
You are an expert Cypher developer. Your task is to translate a natural language question about a git repository into a Cypher query for a Neo4j database.

Here is the database schema:
{schema}

Guidelines:
1. Respond with a JSON object containing a single key "cypher" containing the executable Cypher query.
2. Use relative lookups or case-insensitive matching where appropriate (e.g. use `TOLOWER(a.name) CONTAINS tolower($name)` or similar patterns).
3. Do not query for labels/relationships that are not in the schema.
4. Keep the query clean and efficient.
5. If search hashes are provided, use `STARTS WITH` or `CONTAINS` as the user might input partial hashes (e.g., first 8 characters).
6. Never call `type(n)` on nodes (e.g. `type(c)` where `c` is a Commit is invalid). In Cypher, `type()` only works on relationships (e.g. `type(r)` where `r` is a relationship like `[r:MODIFIED]`).
7. Do not include path patterns (like `c-[:MODIFIED]->(f)`) directly inside the `RETURN` statement. Only return aliases (e.g. `c.hash`, `f.path`), aggregates, or relationship functions.

Format:
{{"cypher": "<your_cypher_query_here>"}}

User Question: {question}
"""

RESPONSE_SYNTHESIS_PROMPT = """
You are Chronicle, a repository intelligence chatbot. Answer the user's question about the repository using the provided Cypher query results from the Neo4j database.

User Question: {question}
Executed Cypher Query: {cypher}
Neo4j Query Results: {results}

Guideline for answer:
- Answer the user's question clearly in Markdown format based on the results.
- If the results are empty or do not contain the answer, explain that no matches were found in the database.
- Reference authors, dates, and files directly. Highlight commit hashes (first 8 characters).
- Maintain a highly professional and analytical tone.
"""

def generate_cypher(question, model="llama-3.3-70b-versatile"):
    client = get_groq_client()
    prompt = CYPHER_GENERATION_PROMPT.format(schema=SCHEMA_DESCRIPTION, question=question)
    
    try:
        completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a helpful text-to-cypher AI assistant. You must respond only in JSON matching the schema: {\"cypher\": \"query\"}"},
                {"role": "user", "content": prompt}
            ],
            model=model,
            temperature=0.0,
            max_tokens=400,
            response_format={"type": "json_object"}
        )
        response_text = completion.choices[0].message.content.strip()
        data = json.loads(response_text)
        validated = CypherResponse.model_validate(data)
        return validated.cypher.strip()
    except Exception as e:
        print(f"Error during structured Cypher generation: {e}. Retrying without structured format...")
        # Fallback to standard unstructured call in case Groq JSON Mode fails
        completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a helpful text-to-cypher AI assistant."},
                {"role": "user", "content": prompt}
            ],
            model=model,
            temperature=0.0,
            max_tokens=400,
        )
        cypher = completion.choices[0].message.content.strip()
        # Clean markdown formatting if present
        cypher = re.sub(r"^```(cypher)?\s*", "", cypher)
        cypher = re.sub(r"\s*```$", "", cypher)
        return cypher

def query_graph_agent(question, model="llama-3.3-70b-versatile"):
    """
    Translates question to Cypher, executes it, and synthesizes a natural response.
    Supports a single self-correction cycle if the first Cypher query fails.
    """
    if not check_connection():
        raise ConnectionError("Neo4j database is not connected.")
        
    client = get_groq_client()
    cypher = generate_cypher(question, model)
    
    # Execution block with simple self-correction
    results = None
    execution_error = None
    try:
        results = run_cypher_query(cypher)
    except Exception as e:
        execution_error = str(e)
        print(f"First Cypher draft failed: {cypher}\nError: {execution_error}")
        
    if execution_error:
        # Retry with correction context
        correction_prompt = (
            f"The Cypher query you wrote failed to execute.\n"
            f"Question: {question}\n"
            f"Failed Cypher: {cypher}\n"
            f"Error message: {execution_error}\n\n"
            f"Please rewrite the Cypher query to fix the error and return a JSON object with the corrected query: {{\"cypher\": \"corrected_query\"}}"
        )
        try:
            completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You are a helpful text-to-cypher AI assistant. You must respond only in JSON matching the schema: {\"cypher\": \"query\"}"},
                    {"role": "user", "content": correction_prompt}
                ],
                model=model,
                temperature=0.0,
                max_tokens=400,
                response_format={"type": "json_object"}
            )
            response_text = completion.choices[0].message.content.strip()
            data = json.loads(response_text)
            validated = CypherResponse.model_validate(data)
            cypher = validated.cypher.strip()
            results = run_cypher_query(cypher)
            execution_error = None
        except Exception as retry_err:
            print(f"Structured correction retry failed: {retry_err}. Falling back to unstructured retry...")
            try:
                # Fallback to standard unstructured call
                completion = client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": "You are a helpful text-to-cypher AI assistant."},
                        {"role": "user", "content": correction_prompt}
                    ],
                    model=model,
                    temperature=0.0,
                    max_tokens=400,
                )
                corrected_cypher = completion.choices[0].message.content.strip()
                corrected_cypher = re.sub(r"^```(cypher)?\s*", "", corrected_cypher)
                corrected_cypher = re.sub(r"\s*```$", "", corrected_cypher)
                cypher = corrected_cypher
                results = run_cypher_query(cypher)
                execution_error = None
            except Exception as final_err:
                raise RuntimeError(f"Cypher execution failed after auto-correction: {final_err} (Original query: {cypher})")

    # Synthesize response
    synthesis_input = RESPONSE_SYNTHESIS_PROMPT.format(
        question=question,
        cypher=cypher,
        results=str(results),
    )
    
    completion = client.chat.completions.create(
        messages=[
            {"role": "system", "content": "You are Chronicle, a repository intelligence chatbot."},
            {"role": "user", "content": synthesis_input}
        ],
        model=model,
        temperature=0.2,
        max_tokens=1000,
    )
    
    return completion.choices[0].message.content.strip()
