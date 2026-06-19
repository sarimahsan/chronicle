# <h1 align="center" style="border-bottom: none;"><img src="https://readme-typing-svg.demolab.com?font=Outfit&weight=700&size=32&duration=2000&pause=1000&color=818CF8&center=true&vCenter=true&width=500&lines=Chronicle;Repo+Intelligence" alt="Chronicle"></h1>

<p align="center">
  <img src="https://img.shields.io/badge/Graph%20DB-Neo4j-008cc1?style=for-the-badge&logo=neo4j" alt="DB Engine" />
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi" alt="API" />
  <img src="https://img.shields.io/badge/AI-Groq%20Llama%203-f34f29?style=for-the-badge&logo=meta" alt="AI Engine" />
</p>

<p align="center" style="font-size: 16px; color: #94a3b8; font-weight: 500;">
  Interact with your Git history, inspect code changes, and unlock repository knowledge in real-time.
</p>

---

## <span style="color: #818cf8;">✨ Overview</span>

Chronicle is a personal developer assistant that turns your git history into a database. It analyzes commits, line changes, and author habits, displaying them on a premium visual dashboard. You can chat with it in natural language to answer complex questions about your codebase.

---

## <span style="color: #818cf8;">🎨 Key Features</span>

### <span style="color: #6366f1;">💬 Chat with your Codebase</span>
Ask questions in plain English and receive instant, structured answers:
* <span style="color: #a5b4fc;">*“Summarize the latest changes in the repository”*</span>
* <span style="color: #a5b4fc;">*“Who is modifying the configuration files the most?”*</span>
* <span style="color: #a5b4fc;">*“List recent bug fixes related to the backend”*</span>

### <span style="color: #6366f1;">📊 Dev Insights Dashboard</span>
Monitor project status and knowledge distribution:
* **High-Churn Files**: Instantly see which files are being modified most frequently and require the most code changes.
* **Knowledge Risk ("Bus Factor")**: Flags files that have only ever been modified by a single developer so you can identify knowledge silos.
* **Contributor Leaderboards**: Check authorship stats and contribution frequencies.

### <span style="color: #6366f1;">🔍 Interactive Commit Diff Inspector</span>
Deep-dive into specific edits directly from your chat window:
* Click on any commit hash (e.g., `#6e8ce126`) in the chat to open a visual, syntax-highlighted diff modal.
* Easily inspect precisely what code lines were inserted or deleted in that commit.

### <span style="color: #6366f1;">📂 Multi-Repository Dropdown & Live Sync</span>
Switch between different projects and keep them up to date instantly:
* **Project Switcher**: Select your active repository from a dropdown in the sidebar to auto-update the analytics panels and point the chatbot to that project.
* **Sync & Refresh**: Click the refresh/sync button next to the dropdown at any time to pull new commits (if remote) or re-read local files, instantly updating the Neo4j graph and the Dev Insights metrics.

---

## <span style="color: #818cf8;">🚀 Getting Started</span>

### <span style="color: #34d399;">1. Ingest a Repository</span>
In the sidebar, enter the folder path or Git URL of the project you want to analyze:
* **Local Workspace**: Enter the absolute path on your computer.
* **Remote Repository**: Enter a GitHub or GitLab HTTPS clone link (e.g., `https://github.com/sarimahsan/chronicle.git`).
* **Private Repositories**: Provide a GitHub Personal Access Token (PAT) in the optional token field.

Click **Ingest Repository** to parse the history and build your project's intelligence network.

### <span style="color: #34d399;">2. Query and Explore</span>
* Use the **Suggested Queries** on the welcome page to start exploring.
* Switch to the **Dev Insights** tab in the sidebar to review repository metrics.
* Click on files, authors, or commit hashes to auto-trigger queries or inspect specific code diffs.

---

## <span style="color: #818cf8;">🐳 Quick Start with Docker (Recommended)</span>

The fastest way to get Chronicle running is with **Docker Compose**, which starts the frontend, backend, and a Neo4j database automatically.

### <span style="color: #f472b6;">1. Configuration</span>
Copy the `.env.example` file in the root directory to a new file named `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your keys:
```env
GROQ_API_KEY=gsk_your_actual_key_here
NEO4J_USER=neo4j
NEO4J_PASSWORD=choose_a_secure_password
```

### <span style="color: #f472b6;">2. Run</span>
Start the entire stack using Docker Compose:
```bash
docker compose up --build
```
Once initialized:
* **Frontend Web App** is available at: **`http://localhost:5173`**
* **Backend API Documentation** is available at: **`http://localhost:8000/docs`**
* **Neo4j DBMS Dashboard** is available at: **`http://localhost:7474`**

---

## <span style="color: #818cf8;">🛠️ Manual Setup (Local Dev)</span>

If you prefer to run services manually without Docker, follow these instructions:

<details>
<summary><b>▶ Manual Run Instructions (Click to Expand)</b></summary>

### Prerequisites
* **Python 3.10+** (for the backend server)
* **Node.js** (for the frontend application)
* **Neo4j Database** (Neo4j Desktop or AuraDB instance running)

### Configuration
Create a `.env` file in the `backend/` directory:
```env
GROQ_API_KEY=your_groq_api_key
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

### Run Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Run Frontend
```bash
cd frontend
npm install
npm run dev
```
</details>

