# repodiagram.py

Generate a focused, clickable **Mermaid architecture diagram** from any public or private GitHub repository — powered by a local [Ollama](https://ollama.com) LLM.

```
🔍 Analyzing vercel/next.js...

[ 1/2 ] Collecting repository data
        ✓ file tree (1999 lines), README (3212 chars), 4 manifest files

[ 2/2 ] Running AI pipeline
        Purpose: A full-stack React framework for building production-grade web applications.
        Classification: 10 Core | 7 Supporting | 13 Dev (dropped)

✓ Diagram written to diagram.mmd
```

---

## How it works

The script runs a **5-step AI pipeline** to produce a signal-rich, low-noise diagram:

| Step | What happens |
|------|-------------|
| **0 — Purpose** | Extracts a one-sentence description of what the repo *does* for its users. Used as a focus lens for all subsequent steps. |
| **1 — Classify** | Analyses the file tree, README, manifests, CI configs, and entry-point imports. Classifies every component into **Core**, **Supporting**, or **Dev**. Dev tooling (linters, bundlers, test runners, CI definitions) is dropped entirely. |
| **2 — Map** | Maps each Core and Supporting component to its most representative file or directory in the repo. |
| **3 — Generate** | Produces a Mermaid diagram with tier-based styling, an edge budget (≤ 3 per node), and clickable links to the correct GitHub file or folder for every block. |
| **4 — Validate** | Audits the diagram against manifest files (docker-compose, .env.example, package.json) for missing nodes or edges. |
| **5 — Repair** | If gaps are found, patches them while preserving the existing diagram. |

### Visual tiers

| Colour | Tier | Meaning |
|--------|------|---------|
| 🔵 Blue | Core | Cannot function without it |
| ⚫ Grey | Supporting | Degrades without it (caching, email, analytics) |
| 🟣 Purple dashed | External SaaS | Third-party service (Stripe, SendGrid, etc.) |
| 🟢 Green | Database | Persistent storage |
| 🟡 Yellow | Queue | Message broker / async worker |

---

## Requirements

```bash
pip install requests PyYAML
# optional — enables auto-loading of .env
pip install python-dotenv
```

**Ollama** must be running locally (or accessible via `--ollama-url`):

```bash
# Install: https://ollama.com
ollama serve
ollama pull qwen3.5:397b-cloud   # or any model with a large context window
```

---

## Setup

Create a `.env` file in the same directory as the script:

```env
GITHUB_TOKEN=github_pat_...   # required for private repos or high request volume
OLLAMA_URL=http://localhost:11434  # optional, this is the default
OLLAMA_MODEL=qwen3.5:397b-cloud    # optional, overrides the default model
```

> A GitHub token is strongly recommended even for public repos — unauthenticated requests are limited to **60/hour** and the script makes ~30+ calls per run. No scopes are needed for public repos; generate one at [github.com/settings/tokens](https://github.com/settings/tokens).

---

## Usage

```bash
# Basic — prints diagram to stdout
python diagram.py owner/repo

# Save to file
python diagram.py owner/repo --out diagram.mmd

# Use a specific model
python diagram.py owner/repo --model llama3.1:70b --out diagram.mmd

# Point at a remote Ollama instance
python diagram.py owner/repo --ollama-url http://my-server:11434 --out diagram.mmd

# Pass a GitHub token inline (bypasses .env / env var)
python diagram.py owner/repo --token github_pat_... --out diagram.mmd

# Skip validation (faster, skips steps 4 and 5)
python diagram.py owner/repo --skip-validation --out diagram.mmd
```

### All options

| Flag | Default | Description |
|------|---------|-------------|
| `repo` | *(required)* | GitHub repo in `owner/name` format |
| `--out` | stdout | File path to write the `.mmd` output |
| `--model` | `qwen3.5:397b-cloud` | Ollama model (env: `OLLAMA_MODEL`) |
| `--ollama-url` | `http://localhost:11434` | Ollama base URL (env: `OLLAMA_URL`) |
| `--token` | — | GitHub PAT (env: `GITHUB_TOKEN`) |
| `--skip-validation` | false | Skip steps 4 and 5 for a faster run |

---

## Viewing the diagram

**VS Code** — install the [Mermaid Preview](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid) extension and open the `.mmd` file.

**Browser** — paste the output into [mermaid.live](https://mermaid.live).

**Markdown** — wrap the contents in a fenced code block:

````markdown
```mermaid
<paste diagram here>
```
````

Each block in the diagram is **clickable** and links directly to the corresponding file or folder on GitHub.

---

## Model recommendations

Models with larger context windows produce more accurate results on large repos:

| Model | Context | Quality |
|-------|---------|---------|
| `qwen3.5:397b-cloud` | 128k | ⭐⭐⭐⭐⭐ Best |
| `llama3.1:70b` | 128k | ⭐⭐⭐⭐ |
| `qwen2.5-coder:32b` | 128k | ⭐⭐⭐⭐ Good for code-heavy repos |
| `llama3.1:8b` | 128k | ⭐⭐⭐ Fast, less accurate |

---

## Example output

The diagram for `vercel/next.js` produced by this script:

- **Dropped** 13 Dev components (ESLint, Jest, Prettier, GitHub Actions workflows, etc.)
- **Kept** 10 Core components (Runtime Server, Turbopack, App Router, RSC Runtime, etc.)
- **Linked** each block to its correct GitHub directory (`/tree/main/...`) or file (`/blob/main/...`)
- **Edge budget** enforced — each node has at most 3 outgoing connections
