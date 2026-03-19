import os
import re
import json
import socket
import subprocess
from urllib.parse import urlparse
import cocoindex
from numpy.typing import NDArray
import numpy as np

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6334")
COCOINDEX_DATABASE_URL = os.environ.get(
    "COCOINDEX_DATABASE_URL", "postgres://cocoindex:cocoindex@localhost:5432/cocoindex"
)


def _tcp_reachable(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def check_services():
    # ── Qdrant ────────────────────────────────────────────────────────────────
    parsed_qdrant = urlparse(QDRANT_URL)
    qdrant_host = parsed_qdrant.hostname or "localhost"
    qdrant_port = parsed_qdrant.port or 6334
    if not _tcp_reachable(qdrant_host, qdrant_port):
        raise RuntimeError(
            f"Qdrant is not reachable at {QDRANT_URL}.\n"
            "Start it before running the indexer, e.g.:\n"
            "  docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant\n"
            "Or set the QDRANT_URL environment variable to point to a running instance."
        )
    print("Qdrant is reachable.")

    # ── PostgreSQL ────────────────────────────────────────────────────────────
    parsed_pg = urlparse(COCOINDEX_DATABASE_URL)
    pg_host = parsed_pg.hostname or "localhost"
    pg_port = parsed_pg.port or 5432
    if not _tcp_reachable(pg_host, pg_port):
        raise RuntimeError(
            f"PostgreSQL is not reachable at {pg_host}:{pg_port}.\n"
            "Start it before running the indexer, e.g.:\n"
            "  docker run -d -e POSTGRES_USER=cocoindex -e POSTGRES_PASSWORD=cocoindex \\\n"
            "             -e POSTGRES_DB=cocoindex -p 5432:5432 postgres:16-alpine\n"
            "Or set the COCOINDEX_DATABASE_URL environment variable to point to a running instance."
        )
    print("PostgreSQL is reachable.")

    os.environ["COCOINDEX_DATABASE_URL"] = COCOINDEX_DATABASE_URL

def index_codebase(project_id: str):
    json_path = os.path.join("graph-ui", "src", "architectures", f"{project_id}.json")
    if not os.path.exists(json_path):
        raise ValueError(f"Project '{project_id}' JSON not found.")
        
    with open(json_path, "r") as f:
        data = json.load(f)
        
    repo = data.get("original_repo")
    if not repo:
        raise ValueError(f"Field 'original_repo' not found in architecture JSON.")
        
    # Clone the repo locally
    target_dir = os.path.abspath(os.path.join("projects", project_id))
    if not os.path.exists(target_dir):
        if "/" in repo:
            # e.g., microsoft/BitNet
            subprocess.run(["git", "clone", "--depth", "1", f"https://github.com/{repo}.git", target_dir], check=True)
        else:
            raise ValueError(f"Original repo '{repo}' doesn't look like a standard github owner/repo string.")

    check_services()

    # Prepare CocoIndex flow
    @cocoindex.transform_flow()
    def code_to_embedding(text: cocoindex.DataSlice[str]) -> cocoindex.DataSlice[NDArray[np.float32]]:
        return text.transform(
            cocoindex.functions.SentenceTransformerEmbed(
                model="sentence-transformers/all-MiniLM-L6-v2"
            )
        )

    QDRANT_COLLECTION = f"{project_id}"

    qdrant_connection = cocoindex.add_auth_entry(
        "Qdrant",
        cocoindex.targets.QdrantConnection(grpc_url=QDRANT_URL),
    )

    safe_project_id = re.sub(r'[^a-zA-Z0-9_]', '_', project_id)
    @cocoindex.flow_def(name=f"CodeEmbedding_{safe_project_id}")
    def code_embedding_flow(flow_builder: cocoindex.FlowBuilder, data_scope: cocoindex.DataScope) -> None:
        data_scope["files"] = flow_builder.add_source(
            cocoindex.sources.LocalFile(
                path=target_dir,
                included_patterns=["*.py", "*.rs", "*.ts", "*.js", "*.tsx", "*.jsx", "*.go", "*.java", "*.c", "*.cpp", "*.h", "*.txt", "*.md"],
                excluded_patterns=["**/.*", "target", "**/node_modules", "**/dist", "**/build"],
            )
        )
        code_embeddings = data_scope.add_collector()

        with data_scope["files"].row() as file:
            file["language"] = file["filename"].transform(
                cocoindex.functions.DetectProgrammingLanguage()
            )
            file["chunks"] = file["content"].transform(
                cocoindex.functions.SplitRecursively(),
                language=file["language"],
                chunk_size=1000,
                min_chunk_size=300,
                chunk_overlap=300,
            )
            with file["chunks"].row() as chunk:
                # Need to cast the NDArray down to list of floats for Qdrant client payload insertion?
                # Actually, Cocoindex's Qdrant targets handles it properly natively.
                chunk["embedding"] = chunk["text"].call(code_to_embedding)
                code_embeddings.collect(
                    id=cocoindex.GeneratedField.UUID,
                    filename=file["filename"],
                    location=chunk["location"],
                    code=chunk["text"],
                    embedding=chunk["embedding"],
                    start=chunk["start"],
                    end=chunk["end"],
                )

        code_embeddings.export(
            "code_embeddings",
            cocoindex.targets.Qdrant(
                collection_name=QDRANT_COLLECTION,
                connection=qdrant_connection,
            ),
            primary_key_fields=["id"],
        )

    # Evaluate the flow
    cocoindex.init()
    code_embedding_flow.setup()
    stats = code_embedding_flow.update()
    print("CocoIndex indexing completed successfully:", stats)
    return stats

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        index_codebase(sys.argv[1])
