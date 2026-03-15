from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import os
from dotenv import load_dotenv

# Force load the .env
load_dotenv()

if not os.environ.get("OPENAI_API_KEY") and os.environ.get("OPENAI_API_TOKEN"):
    os.environ["OPENAI_API_KEY"] = os.environ.get("OPENAI_API_TOKEN")

# We only want to run the OpenAI agent if the user is using OpenAI.
# For Ollama, the openai-agents package can technically work if configured correctly 
# to hit a custom base URL, but for the scope of this task we will just rely on the 
# openai-agents SDK as imported.
import json
import subprocess
from agents import Agent, Runner, function_tool

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@function_tool
def read_architecture_json(project: str) -> str:
    """Read the full architecture graph JSON for a specific project to analyze its nodes, components, and edges."""
    try:
        path = os.path.join(os.path.dirname(__file__), "graph-ui", "src", "architectures", f"{project}.json")
        with open(path, "r") as f:
            # return minified json to save tokens
            return json.dumps(json.load(f), separators=(',', ':'))
    except Exception as e:
        return f"Error reading architecture JSON: {e}"

@function_tool
def search_codebase(project: str, query: str) -> str:
    """Use this to perform a semantic search across the actual indexed source code of a project. Use this when you need to see exactly how a function, class, or algorithm is logically implemented at the code level."""
    from sentence_transformers import SentenceTransformer
    from qdrant_client import QdrantClient
    print(f"[QDRANT] search_codebase called — project='{project}' query='{query}'")
    try:
        model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        embeds = model.encode([query])
        client = QdrantClient(url="http://localhost:6334", prefer_grpc=True)
        # Suppress deprecation warning
        res = client.query_points(collection_name=project, query=list(embeds)[0], using="embedding", limit=3).points
        
        output = []
        for r in res:
            filename = r.payload.get("filename", "Unknown")
            start = r.payload.get("start", {}).get("line", "?")
            end = r.payload.get("end", {}).get("line", "?")
            code = r.payload.get("code", "")
            output.append(f"--- {filename} (Lines: {start}-{end}) ---\n{code}\n")
            
        print(f"[QDRANT] returned {len(output)} result(s) for query='{query}'")
        return "\n".join(output) if output else "No results found."
    except Exception as e:
        print(f"[QDRANT] error for query='{query}': {e}")
        return f"Error searching codebase embeddings (has the user clicked 'Index Code' yet?): {e}"

# Initialize the Agent
architect_agent = Agent(
    name="Architecture Assistant",
    instructions=(
        "You are an expert software architect assistant. "
        "You help the user design systems, understand architectures, and make technical decisions. "
        "Be concise and use modern best practices. "
        "Use read_architecture_json FIRST to understand the high-level system topology, services, and how they connect. "
        "Use search_codebase LATER to dive into deep code snippets and find exact function logic if the user asks for implementation details."
    ),
    tools=[read_architecture_json, search_codebase]
)

class ChatRequest(BaseModel):
    message: str
    project: str | None = None

class IndexRequest(BaseModel):
    project: str

class DiagramEditRequest(BaseModel):
    message: str
    project: str

class DiagramSaveRequest(BaseModel):
    project: str
    label: str | None = None

class ImplementRequest(BaseModel):
    project: str
    hint: str | None = None

class ConfirmRequest(BaseModel):
    project: str

# In-memory pending proposals store: project -> proposal
pending_proposals: dict = {}

@app.get("/api/index_status/{project}")
async def index_status_endpoint(project: str):
    from qdrant_client import QdrantClient
    try:
        client = QdrantClient(url="http://localhost:6334", prefer_grpc=True)
        return {"indexed": client.collection_exists(collection_name=project)}
    except Exception:
        return {"indexed": False}


@app.post("/api/index_code")
async def index_endpoint(req: IndexRequest):
    import subprocess
    try:
        res = subprocess.run(["python", "indexer.py", req.project], capture_output=True, text=True)
        if res.returncode != 0:
            raise Exception(res.stderr or res.stdout)
        return {"status": "success"}
    except Exception as e:
        print(f"Error indexing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    try:
        # We can simply run the agent with the user's message.
        # Note: If we need memory across turns, we would handle session/conversation_ids.
        # For simplicity, we just pass the latest message to the agent.
        prompt = f"[Context: The user is actively viewing the architecture for project '{req.project}']\n\nUser Question: {req.message}" if req.project else req.message
        result = await Runner.run(architect_agent, prompt)
        return {"response": result.final_output}
    except Exception as e:
        print(f"Error running agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def _git_save_diagram(project_dir: str, diagram_path: str, message: str) -> str:
    import shutil
    dest = os.path.join(project_dir, "architecture.json")
    shutil.copy2(diagram_path, dest)

    def git(cmd):
        return subprocess.run(["git"] + cmd, cwd=project_dir, capture_output=True, text=True, check=True)

    branches = subprocess.run(["git", "branch"], cwd=project_dir, capture_output=True, text=True).stdout
    if "diagramedits" in branches:
        git(["checkout", "diagramedits"])
    else:
        git(["checkout", "-b", "diagramedits"])

    git(["add", "architecture.json"])
    subprocess.run(["git", "commit", "-m", message], cwd=project_dir, capture_output=True, text=True)
    result = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=project_dir, capture_output=True, text=True)
    return result.stdout.strip()


@app.post("/api/diagram/edit")
async def diagram_edit_endpoint(req: DiagramEditRequest):
    diagram_path = os.path.join(os.path.dirname(__file__), "graph-ui", "src", "architectures", f"{req.project}.json")
    try:
        with open(diagram_path, "r") as f:
            current_diagram = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Diagram not found: {e}")

    edit_agent = Agent(
        name="Diagram Editor",
        instructions=(
            "You are a diagram editor. You will receive the current architecture diagram JSON and an edit instruction. "
            "Output ONLY a valid JSON object with 'nodes' and 'edges' arrays — no prose, no markdown fences, no explanation. "
            "Preserve existing node IDs and structure where possible. Only make the requested changes."
        ),
        tools=[]
    )

    prompt = f"Current diagram:\n{json.dumps(current_diagram)}\n\nEdit instruction: {req.message}"
    result = await Runner.run(edit_agent, prompt)

    try:
        new_diagram = json.loads(result.final_output)
    except json.JSONDecodeError:
        import re as _re
        match = _re.search(r'\{.*\}', result.final_output, _re.DOTALL)
        if match:
            new_diagram = json.loads(match.group())
        else:
            raise HTTPException(status_code=500, detail="Agent did not return valid JSON")

    with open(diagram_path, "w") as f:
        json.dump(new_diagram, f, indent=2)

    # Auto-save to diagramedits branch
    project_dir = os.path.join(os.path.dirname(__file__), "projects", req.project)
    commit_hash = None
    if os.path.isdir(os.path.join(project_dir, ".git")):
        try:
            commit_hash = _git_save_diagram(project_dir, diagram_path, f"auto-save: {req.message[:72]}")
        except Exception as e:
            print(f"Warning: auto-save git commit failed: {e}")

    return {"diagram": new_diagram, "commit_hash": commit_hash}


@app.post("/api/diagram/save")
async def diagram_save_endpoint(req: DiagramSaveRequest):
    diagram_path = os.path.join(os.path.dirname(__file__), "graph-ui", "src", "architectures", f"{req.project}.json")
    project_dir = os.path.join(os.path.dirname(__file__), "projects", req.project)

    if not os.path.isdir(os.path.join(project_dir, ".git")):
        raise HTTPException(status_code=404, detail=f"No git repo found at projects/{req.project}. Clone it first.")

    label = req.label or f"diagram snapshot for {req.project}"
    try:
        commit_hash = _git_save_diagram(project_dir, diagram_path, label)
        return {"commit_hash": commit_hash, "branch": "diagramedits"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _compute_diagram_diff(prev: dict, curr: dict) -> dict:
    prev_node_ids = {n["id"] for n in prev.get("nodes", [])}
    curr_node_ids = {n["id"] for n in curr.get("nodes", [])}
    prev_edge_keys = {f"{e['source']}->{e['target']}" for e in prev.get("edges", [])}
    curr_edge_keys = {f"{e['source']}->{e['target']}" for e in curr.get("edges", [])}
    return {
        "added_nodes":   [n for n in curr.get("nodes", []) if n["id"] not in prev_node_ids],
        "removed_nodes": [n for n in prev.get("nodes", []) if n["id"] not in curr_node_ids],
        "added_edges":   [e for e in curr.get("edges", []) if f"{e['source']}->{e['target']}" not in prev_edge_keys],
        "removed_edges": [e for e in prev.get("edges", []) if f"{e['source']}->{e['target']}" not in curr_edge_keys],
    }


def _search_qdrant(project: str, queries: list[str], limit_per_query: int = 2) -> str:
    from sentence_transformers import SentenceTransformer
    from qdrant_client import QdrantClient
    try:
        model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        client = QdrantClient(url="http://localhost:6334", prefer_grpc=True)
        snippets = []
        for query in queries:
            embeds = model.encode([query])
            res = client.query_points(collection_name=project, query=list(embeds)[0], using="embedding", limit=limit_per_query).points
            for r in res:
                fname = r.payload.get("filename", "?")
                code = r.payload.get("code", "")
                snippets.append(f"--- {fname} ---\n{code}")
        return "\n\n".join(snippets) if snippets else ""
    except Exception as e:
        return f"(Qdrant unavailable: {e})"


@app.post("/api/diagram/implement")
async def diagram_implement_endpoint(req: ImplementRequest):
    diagram_path = os.path.join(os.path.dirname(__file__), "graph-ui", "src", "architectures", f"{req.project}.json")
    project_dir = os.path.join(os.path.dirname(__file__), "projects", req.project)

    if not os.path.isdir(os.path.join(project_dir, ".git")):
        raise HTTPException(status_code=404, detail=f"No git repo at projects/{req.project}. Clone it first.")

    with open(diagram_path) as f:
        current_diagram = json.load(f)

    # Get previous diagram from the last diagramedits commit
    prev_result = subprocess.run(
        ["git", "show", "diagramedits:architecture.json"],
        cwd=project_dir, capture_output=True, text=True
    )
    prev_diagram = json.loads(prev_result.stdout) if prev_result.returncode == 0 else {"nodes": [], "edges": []}

    diff = _compute_diagram_diff(prev_diagram, current_diagram)

    # Get the diagram commit hash for branch naming
    hash_result = subprocess.run(
        ["git", "rev-parse", "--short", "diagramedits"],
        cwd=project_dir, capture_output=True, text=True
    )
    diagram_hash = hash_result.stdout.strip() if hash_result.returncode == 0 else "latest"

    # Build branch name from changed node IDs
    changed_ids = [n["id"] for n in diff["added_nodes"]] + [n["id"] for n in diff["removed_nodes"]]
    slug = "-".join(changed_ids[:3]) if changed_ids else "diagram-changes"
    import re as _re
    slug = _re.sub(r'[^a-zA-Z0-9-]', '-', slug)
    branch_name = f"impl/{slug}-{diagram_hash}"

    # Search codebase for context around changed components
    search_queries = [n.get("label", n["id"]) for n in diff["added_nodes"] + diff["removed_nodes"]]
    search_queries += [f"{e['source']} to {e['target']}" for e in diff["added_edges"]]
    code_context = _search_qdrant(req.project, search_queries[:4]) if search_queries else "(no changes detected)"

    impl_agent = Agent(
        name="Implementation Planner",
        instructions=(
            "You are a code implementation planner for software architecture changes. "
            "Given a diagram diff and existing codebase snippets, produce a concrete file-level implementation plan. "
            "Output ONLY a valid JSON array — no prose, no markdown fences. "
            "Each element must have: "
            "  path (string, relative to project root), "
            "  action ('create' or 'modify'), "
            "  content (complete file content as a string), "
            "  summary (one sentence describing the change). "
            "Match the coding style and conventions visible in the existing code snippets. "
            "For 'modify' actions, write the full updated file content, not a diff."
        ),
        tools=[]
    )

    hint_line = f"\nUser focus hint: {req.hint}" if req.hint else ""
    prompt = (
        f"Project: {req.project}\n"
        f"Diagram diff:\n{json.dumps(diff, indent=2)}\n\n"
        f"Relevant existing code:\n{code_context}"
        f"{hint_line}"
    )
    result = await Runner.run(impl_agent, prompt)

    try:
        files = json.loads(result.final_output)
    except json.JSONDecodeError:
        match = _re.search(r'\[.*\]', result.final_output, _re.DOTALL)
        if match:
            files = json.loads(match.group())
        else:
            raise HTTPException(status_code=500, detail="Agent did not return a valid JSON array")

    proposal = {
        "project": req.project,
        "diagram_hash": diagram_hash,
        "branch_name": branch_name,
        "diff": diff,
        "files": files,
    }
    pending_proposals[req.project] = proposal
    return proposal


@app.post("/api/diagram/confirm")
async def diagram_confirm_endpoint(req: ConfirmRequest):
    proposal = pending_proposals.get(req.project)
    if not proposal:
        raise HTTPException(status_code=404, detail="No pending proposal for this project.")

    project_dir = os.path.join(os.path.dirname(__file__), "projects", req.project)
    branch = proposal["branch_name"]

    def git(cmd):
        return subprocess.run(["git"] + cmd, cwd=project_dir, capture_output=True, text=True, check=True)

    git(["checkout", "-b", branch])

    written = []
    for op in proposal["files"]:
        filepath = os.path.join(project_dir, op["path"])
        dir_path = os.path.dirname(filepath)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)
        with open(filepath, "w") as f:
            f.write(op["content"])
        written.append(op["path"])

    git(["add", "."])
    git(["commit", "-m", f"impl: {branch.removeprefix('impl/')}"])

    commit_hash = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=project_dir, capture_output=True, text=True
    ).stdout.strip()

    del pending_proposals[req.project]
    return {"branch": branch, "commit_hash": commit_hash, "files_written": written}


@app.post("/api/diagram/discard")
async def diagram_discard_endpoint(req: ConfirmRequest):
    pending_proposals.pop(req.project, None)
    return {"status": "discarded"}


if __name__ == "__main__":
    import uvicorn
    # run on port 8123 to avoid conflicts
    uvicorn.run(app, host="0.0.0.0", port=8833)
