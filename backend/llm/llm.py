import os
from dotenv import load_dotenv
from groq import Groq

# Load environment variables
load_dotenv()

# Set up Groq client
def get_groq_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set in the environment variables or .env file.")
    return Groq(api_key=api_key)

def format_commits_context(commits, limit=200):
    """
    Formats the list of commits into a structured text context.
    We limit the count of commits to prevent exceeding LLM context limits for v1.
    """
    context_lines = []
    # If there are more commits than the limit, take the most recent ones
    active_commits = commits[:limit]
    
    for c in active_commits:
        files_str = ", ".join(c["files_changed"]) if c["files_changed"] else "None"
        line = (
            f"Commit: {c['hash'][:8]}\n"
            f"Author: {c['author']} <{c['email']}>\n"
            f"Date: {c['date']}\n"
            f"Message: {c['message']}\n"
            f"Files: {files_str} (+{c['insertions']}, -{c['deletions']})\n"
            f"{'-'*40}"
        )
        context_lines.append(line)
        
    return "\n".join(context_lines)

def query_llm(commits, question, model="llama-3.3-70b-versatile"):
    """
    Formulates a prompt with commit context and queries Groq LLM.
    """
    client = get_groq_client()
    
    commits_context = format_commits_context(commits)
    
    system_prompt = (
        "You are Chronicle, a repository intelligence chatbot. Your task is to analyze the commit history "
        "of a codebase and answer user questions. You have direct access to the commit logs including "
        "hashes, authors, emails, dates, messages, files changed, and line statistics (insertions/deletions).\n\n"
        "Guideline for answers:\n"
        "- Be factual and base your answers strictly on the commit logs provided.\n"
        "- Reference commit hashes (first 8 chars) when discussing specific changes.\n"
        "- Synthesize history (e.g., 'Author A touched index.html 5 times, while Author B touched it once').\n"
        "- If the logs do not contain the answer, say so clearly and suggest what information might be missing "
        "(e.g., PR comments, issues, or file contents that will be added in v2).\n"
        "- Present lists, comparisons, or timelines in clear Markdown tables or bullet points."
    )
    
    user_prompt = (
        f"Here is the commit history of the repository (newest to oldest):\n\n"
        f"{commits_context}\n\n"
        f"User Question: {question}\n\n"
        f"Answer:"
    )
    
    try:
        completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=model,
            temperature=0.2,
            max_tokens=1500,
        )
        return completion.choices[0].message.content
    except Exception as e:
        return f"Error contacting Groq API: {str(e)}"
