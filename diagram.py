#!/usr/bin/env python3
"""
diagram.py — Generate an accurate Graph JSON from any local or remote repo.

Usage:
    python diagram.py <owner/repo or ./local-path>
    python diagram.py vercel/next.js --out nextjs-graph.json
    python diagram.py ./my-project --out local-graph.json
    python diagram.py <target> --detail
"""

import argparse
import json
import os
import re
import sys
import subprocess
import tempfile
import shutil
import time
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    sys.exit("Missing dependency: pip install requests")

# Load .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    _env_path = Path(".") / ".env"
    if _env_path.exists():
        for _line in _env_path.read_text().splitlines():
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))


# ── Configuration ────────────────────────────────────────────────────────────

DEFAULT_MODEL = "qwen3.5:397b-cloud"
DEFAULT_OLLAMA_URL = "http://localhost:11434"
MAX_TOKENS = 4096

MANIFEST_PATHS = [
    "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
    "pyproject.toml", "requirements.txt", "Pipfile", "go.mod", "Cargo.toml",
    "build.gradle", "pom.xml", "docker-compose.yml", "docker-compose.yaml",
    "docker-compose.prod.yml", ".env.example", ".env.sample",
    "prisma/schema.prisma", "schema.prisma", "nginx.conf", "Caddyfile",
    "next.config.js", "next.config.ts", "vite.config.ts", "vite.config.js",
]

CI_PATHS = [
    ".github/workflows", ".circleci/config.yml", "Jenkinsfile",
    ".travis.yml", "azure-pipelines.yml", "cloudbuild.yaml",
]

ENTRY_POINTS = [
    "src/index.ts", "src/index.js", "src/main.ts", "src/main.js",
    "src/app.ts", "src/app.js", "app.ts", "app.js", "main.ts", "main.js",
    "index.ts", "index.js", "server.ts", "server.js", "main.py", "app.py",
    "__main__.py", "cmd/main.go", "main.go", "src/main.rs", "main.rs",
]


# ── Local Repository Client ──────────────────────────────────────────────────

class LocalRepoClient:
    def __init__(self, target: str):
        self.is_temp = False
        if "/" in target and not Path(target).exists():
            print(f"  [Git] '{target}' not found locally. Cloning from GitHub...", flush=True)
            self.root = Path(tempfile.mkdtemp(prefix="repo-"))
            self.is_temp = True
            url = f"https://github.com/{target}.git"
            try:
                subprocess.run(["git", "clone", "--depth", "1", url, str(self.root)], 
                               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except subprocess.CalledProcessError:
                self.cleanup()
                sys.exit(f"\n❌ Failed to clone {url}. Does it exist and is it public?")
        else:
            self.root = Path(target).resolve()
            if not self.root.is_dir():
                sys.exit(f"\n❌ Valid local directory not found: {self.root}")

    def cleanup(self):
        if self.is_temp and self.root.exists():
            shutil.rmtree(self.root, ignore_errors=True)

    def get_file_content(self, path: str) -> Optional[str]:
        p = self.root / path
        if p.is_file():
            try:
                return p.read_text(errors="replace")
            except Exception:
                return None
        return None

    def get_tree(self) -> tuple[str, dict[str, str]]:
        skip = {".git", "node_modules", "dist", "build", ".next", "__pycache__", ".venv", "vendor", "target"}
        lines = []
        path_types = {}

        for root, dirs, files in os.walk(self.root):
            dirs[:] = [d for d in dirs if d not in skip and not d.startswith(".")]
            
            try:
                rel_root = Path(root).relative_to(self.root)
            except ValueError:
                continue

            if str(rel_root) != ".":
                depth = len(rel_root.parts) - 1
                lines.append("  " * depth + rel_root.name + "/")
                path_types[str(rel_root)] = "tree"
                file_depth = depth + 1
            else:
                file_depth = 0

            for f in sorted(files):
                if f.startswith(".DS_Store"): continue
                fpath = rel_root / f if str(rel_root) != "." else Path(f)
                lines.append("  " * file_depth + f)
                path_types[str(fpath)] = "blob"

        return "\n".join(lines[:2000]), path_types

    def get_readme(self) -> str:
        for name in ["README.md", "readme.md", "README", "README.txt"]:
            content = self.get_file_content(name)
            if content: return content[:8000]
        return ""

    def list_directory(self, path: str) -> list[str]:
        d = self.root / path
        if d.is_dir():
            return [str(f.relative_to(self.root)) for f in d.iterdir() if f.is_file()]
        return []


def collect_repo_data(client: LocalRepoClient) -> dict:
    print("  Walking file tree...", flush=True)
    file_tree, path_types = client.get_tree()

    print("  Reading README...", flush=True)
    readme = client.get_readme()

    print("  Reading manifest files...", flush=True)
    manifests = {}
    for path in MANIFEST_PATHS:
        content = client.get_file_content(path)
        if content:
            if "lock" in path.lower() or path in ("yarn.lock",):
                content = content[:3000] + "\n... (truncated)"
            manifests[path] = content[:4000]

    print("  Reading CI/CD configs...", flush=True)
    ci_configs = {}
    for ci_path in CI_PATHS:
        if ci_path.endswith("/"): continue
        if ci_path == ".github/workflows":
            wf_files = client.list_directory(".github/workflows")
            for wf in wf_files[:2]:
                content = client.get_file_content(wf)
                if content: ci_configs[wf] = content[:3000]
        else:
            content = client.get_file_content(ci_path)
            if content: ci_configs[ci_path] = content[:3000]

    print("  Sampling entry-point imports...", flush=True)
    entry_imports = {}
    for ep in ENTRY_POINTS:
        content = client.get_file_content(ep)
        if content:
            lines = content.splitlines()
            import_lines = [l for l in lines if re.match(r"^\s*(import|from|require|use|mod |extern crate)", l)]
            if import_lines:
                entry_imports[ep] = "\n".join(import_lines[:80])

    return {
        "file_tree": file_tree,
        "path_types": path_types,
        "readme": readme,
        "manifests": manifests,
        "ci_configs": ci_configs,
        "entry_imports": entry_imports,
    }


def format_manifests(data: dict) -> str:
    sections = []
    if data["manifests"]:
        sections.append("=== MANIFEST FILES ===")
        for path, content in data["manifests"].items():
            sections.append(f"\n--- {path} ---\n{content}")
    if data["ci_configs"]:
        sections.append("\n=== CI/CD CONFIGS ===")
        for path, content in data["ci_configs"].items():
            sections.append(f"\n--- {path} ---\n{content}")
    if data["entry_imports"]:
        sections.append("\n=== ENTRY-POINT IMPORTS ===")
        for path, imports in data["entry_imports"].items():
            sections.append(f"\n--- {path} ---\n{imports}")
    return "\n".join(sections)


# ── Ollama client ─────────────────────────────────────────────────────────────

class OllamaClient:
    def __init__(self, base_url: str, model: str):
        self.url = base_url.rstrip("/") + "/api/chat"
        self.model = model

    def chat(self, system: str, user: str) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "options": {"num_predict": MAX_TOKENS},
            "think": False
        }
        
        try:
            r = requests.post(self.url, json=payload, timeout=300)
            r.raise_for_status()
        except requests.exceptions.ConnectionError:
            sys.exit(f"Cannot reach Ollama at {self.url}.")
        except requests.exceptions.HTTPError as e:
            sys.exit(f"Ollama API error: {e}\n{r.text}")

        return r.json()["message"]["content"]


def call_ollama(client: OllamaClient, system: str, user: str, step_label: str, debug_dir: Optional[str] = None) -> str:
    print(f"  Calling Ollama [{client.model}] ({step_label})...", flush=True)
    raw = client.chat(system, user)
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

    if debug_dir:
        safe_label = re.sub(r"[^\w]+", "_", step_label)
        debug_path = Path(debug_dir) / f"{safe_label}.txt"
        debug_path.parent.mkdir(parents=True, exist_ok=True)
        debug_path.write_text(f"=== RAW ===\n{raw}\n\n=== CLEANED ===\n{cleaned}")
        print(f"        [debug] saved to {debug_path}", flush=True)

    return cleaned


def extract_json(text: str) -> dict:
    """Robustly extract JSON from model output."""
    try:
        # 1. Try to find the first '{' and last '}'
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            return json.loads(text[start:end+1])
    except Exception:
        pass
    return {}


# ── AI Pipeline Steps ────────────────────────────────────────────────────────

SYSTEM_PROMPT_0 = """Write a single sentence describing what this software DOES for its end user at runtime. Focus on functionality, not how it is built. No preamble."""

def step0_purpose(client: OllamaClient, data: dict, debug_dir: Optional[str] = None) -> str:
    user = f"<file_tree>\n{data['file_tree'][:3000]}\n</file_tree>\n<readme>\n{data['readme'][:4000]}\n</readme>"
    result = call_ollama(client, SYSTEM_PROMPT_0, user, "Step 0/5 — purpose extraction", debug_dir)
    return result.strip().strip('"').strip("'")


SYSTEM_PROMPT_1_FOCUSED = """You are a software architect analyzing a repository. Focus ONLY on runtime architecture.
Classify identified components into tiers: Core, Supporting, Dev. (Exclude Dev tools entirely from classification output).
Output JSON:
<explanation>Architecture details...</explanation>
<classification>{"Core": ["A", "B"], "Supporting": ["C"], "Dev": []}</classification>"""

SYSTEM_PROMPT_1_DETAILED = """You are a software architect analyzing a repository deeply. 
Identify all runtime AND dev components. Identify internal sub-modules for major core services.
Classify components into tiers: Core, Supporting, Dev.
Output JSON:
<explanation>Detailed architecture...</explanation>
<classification>{"Core": ["Service A", "Service B"], "Supporting": ["Cache"], "Dev": ["Webpack", "Jest"]}</classification>"""

def step1_explain(client: OllamaClient, data: dict, purpose: str, detail: bool = False, debug_dir: Optional[str] = None) -> tuple[str, dict]:
    sys_prompt = SYSTEM_PROMPT_1_DETAILED if detail else SYSTEM_PROMPT_1_FOCUSED
    label = "Step 1/5 — architecture classification"
    user = f"<purpose>\n{purpose}\n</purpose>\n<file_tree>\n{data['file_tree'][:4000]}\n</file_tree>\n<additional_signals>\n{format_manifests(data)[:4000]}\n</additional_signals>"
    result = call_ollama(client, sys_prompt, user, label, debug_dir)
    
    exp_match = re.search(r"<explanation>(.*?)</explanation>", result, re.DOTALL)
    explanation = exp_match.group(1).strip() if exp_match else result.strip()
    classification = {"Core": [], "Supporting": [], "Dev": []}
    
    cls_match = re.search(r"<classification>(.*?)</classification>", result, re.DOTALL)
    if cls_match:
        classification = extract_json(cls_match.group(1)) or classification
    return explanation, classification


SYSTEM_PROMPT_2 = """Map provided components to their most representative directory or file path in the tree.
Return JSON mapping: {"ComponentA": "src/api", "ComponentB": "src/db.ts"}"""

def step2_map(client: OllamaClient, explanation: str, file_tree: str, classification: dict, detail: bool = False, debug_dir: Optional[str] = None) -> dict:
    comps = classification.get("Core", []) + classification.get("Supporting", []) + (classification.get("Dev", []) if detail else [])
    comps_list = "\n".join(f"- {c}" for c in comps) if comps else "(all components)"
    user = f"<explanation>\n{explanation}\n</explanation>\n<components_to_map>\n{comps_list}\n</components_to_map>\n<file_tree>\n{file_tree[:4000]}\n</file_tree>"
    result = call_ollama(client, SYSTEM_PROMPT_2, user, "Step 2/5 — file mapping", debug_dir)
    return extract_json(result)


SYSTEM_PROMPT_3 = """You are a graph database engineer creating a Neo4j architecture graph.
We will output JSON representing Nodes and Edges so a script can generate Cypher queries perfectly.

Diagram rules:
1. Create a `nodes` array containing objects: { "id": "ShortId", "label": "Component Name", "tier": "Core|Supporting|Dev", "path": "file/path", "description": "Short explanation" }
2. Create an `edges` array containing objects: { "source": "ShortId", "target": "ShortId", "type": "DEPENDS_ON|CALLS|READS|WRITES|DEPLOYS|BUILDS" }
3. Enforce an edge budget (keep it architecturally significant). Edge types must be UPPERCASE without spaces (e.g., RELIES_ON, USES_DB).
4. Node IDs must be alphanumeric strings without spaces.

Strict Output Format:
Return ONLY valid JSON.
{
  "nodes": [...],
  "edges": [...]
}"""

def step3_generate_graph(client: OllamaClient, purpose: str, explanation: str, classification: dict, component_map: dict, detail: bool, debug_dir: Optional[str] = None) -> dict:
    tiers = {"Core": classification.get("Core", []), "Supporting": classification.get("Supporting", [])}
    if detail: tiers["Dev"] = classification.get("Dev", [])
    
    user = f"<purpose>\n{purpose}\n</purpose>\n<explanation>\n{explanation}\n</explanation>\n<tiers>\n{json.dumps(tiers, indent=2)}\n</tiers>\n<component_paths>\n{json.dumps(component_map, indent=2)}\n</component_paths>"
    result = call_ollama(client, SYSTEM_PROMPT_3, user, "Step 3/5 — Graph DB JSON generation", debug_dir)
    
    parsed = extract_json(result)
    if "nodes" not in parsed:
        print("Warning: Failed to parse perfect JSON for graph DB.")
        return {"nodes": [], "edges": []}
    return parsed


SYSTEM_PROMPT_4 = """Given the architecture graph JSON and manifests, verify if important components (like DBs from .env or services from docker-compose) are missing.
Return JSON:
{ "complete": true/false, "missing_nodes": ["Redis"], "missing_edges": [{"source": "API", "target": "Redis", "type": "USES_CACHE"}], "notes": "..." }"""

def step4_validate(client: OllamaClient, graph_json: dict, data: dict, debug_dir: Optional[str] = None) -> dict:
    if not format_manifests(data): return {"complete": True}
    user = f"<graph>\n{json.dumps(graph_json)}\n</graph>\n<manifests>\n{format_manifests(data)[:6000]}\n</manifests>"
    res = call_ollama(client, SYSTEM_PROMPT_4, user, "Step 4/5 — graph validation", debug_dir)
    return extract_json(res) or {"complete": True}


SYSTEM_PROMPT_5 = """You are a graph repair tool. The provided graph JSON is missing the specified nodes and edges.
Rewrite and return the FULL updated graph JSON incorporating the missing nodes/edges.

Input:
<graph_json>...</graph_json>
<missing_nodes>["Redis"]</missing_nodes>
<missing_edges>[{"source": "API", "target": "Redis", "type": "USES_CACHE"}]</missing_edges>

Output ONLY the completely merged valid JSON:
{
  "nodes": [...],
  "edges": [...]
}"""

def step5_repair_graph(client: OllamaClient, graph_json: dict, validation: dict, debug_dir: Optional[str] = None) -> dict:
    nodes = validation.get("missing_nodes", [])
    edges = validation.get("missing_edges", [])
    if not nodes and not edges: return graph_json
    
    user = f"<graph_json>\n{json.dumps(graph_json)}\n</graph_json>\n<missing_nodes>\n{json.dumps(nodes)}\n</missing_nodes>\n<missing_edges>\n{json.dumps(edges)}\n</missing_edges>"
    res = call_ollama(client, SYSTEM_PROMPT_5, user, "Step 5/5 — repair", debug_dir)
    return extract_json(res) or graph_json


# ── Exporter ────────────────────────────────────────────────────────────────

def build_json_output(graph_data: dict, repo_name: str) -> str:
    """Format the graph data nicely with the repo name attached to prevent collisions."""
    # Ensure all nodes and edges are tagged with exactly this repo
    safe_name = re.sub(r'[\\/*?:"<>|]', "", repo_name)
    
    for node in graph_data.get("nodes", []):
        node["project"] = safe_name
        
    for edge in graph_data.get("edges", []):
        edge["project"] = safe_name
        
    output = {
        "project": safe_name,
        "nodes": graph_data.get("nodes", []),
        "edges": graph_data.get("edges", [])
    }
    
    return json.dumps(output, indent=2)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate a Graph JSON via local git clone")
    parser.add_argument("repo", help="owner/repo (cloned from GitHub) OR local path")
    parser.add_argument("--out", default="graph-ui/src/architectures/graph.json", help="Output file path (default: graph-ui/src/architectures/graph.json)")
    parser.add_argument("--skip-validation", action="store_true", help="Skip missing node checks")
    parser.add_argument("--detail", action="store_true", help="Include Dev tools and sub-modules")
    parser.add_argument("--debug", action="store_true", help="Save intermediate Ollama prompt/responses")
    parser.add_argument("--model", default=os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL))
    parser.add_argument("--ollama-url", default=os.environ.get("OLLAMA_URL", DEFAULT_OLLAMA_URL))
    args = parser.parse_args()

    debug_dir = "debug" if args.debug else None

    print(f"\n🔍 Analyzing repository: {args.repo}...")
    print(f"   Model  : {args.model}")
    print(f"   Mode   : {'detailed' if args.detail else 'focused'}")

    # Local repo clone / crawl
    print("\n[ 1/2 ] Collecting repository data (locally)")
    client = LocalRepoClient(args.repo)
    data = collect_repo_data(client)

    if not data["file_tree"]:
        client.cleanup()
        sys.exit(f"\n❌ Repo '{args.repo}' returned an empty file tree.")

    print(f"        ✓ file tree ({data['file_tree'].count(chr(10))} lines)")

    # AI
    print("\n[ 2/2 ] Running AI Graph DB pipeline")
    ai = OllamaClient(base_url=args.ollama_url, model=args.model)

    purpose = step0_purpose(ai, data, debug_dir)
    explanation, classification = step1_explain(ai, data, purpose, args.detail, debug_dir)
    component_map = step2_map(ai, explanation, data["file_tree"], classification, args.detail, debug_dir)
    
    graph_json = step3_generate_graph(ai, purpose, explanation, classification, component_map, args.detail, debug_dir)

    if not args.skip_validation:
        validation = step4_validate(ai, graph_json, data, debug_dir)
        if not validation.get("complete", True):
            missing_nodes = validation.get("missing_nodes", [])
            print(f"        ⚠ Validation found gaps: {missing_nodes}")
            graph_json = step5_repair_graph(ai, graph_json, validation, debug_dir)
            print("        ✓ Graph JSON repaired")

    json_output = build_json_output(graph_json, args.repo)

    print("\n" + "─" * 60)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json_output)
    print(f"✓ Architecture Graph JSON written to {args.out}")

    client.cleanup()
    print("\nDone.")

if __name__ == "__main__":
    main()
