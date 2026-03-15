import os
import re
import json
import urllib.request
import subprocess
import time
import cocoindex
from numpy.typing import NDArray
import numpy as np

def ensure_qdrant_running():
    try:
        urllib.request.urlopen("http://localhost:6333").read()
        print("Qdrant is already running.")
    except Exception:
        print("Starting Qdrant via Docker...")
        subprocess.run(
            ["docker", "run", "-d", "-p", "6333:6333", "-p", "6334:6334", "qdrant/qdrant"], 
            check=False
        )
        for _ in range(15):
            try:
                urllib.request.urlopen("http://localhost:6333").read()
                print("Qdrant started!")
                break
            except Exception:
                time.sleep(1)

def ensure_db_running():
    try:
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect(("localhost", 5432))
        print("Postgres is running.")
    except Exception:
        print("Starting Postgres via Docker...")
        subprocess.run(
            ["docker", "run", "--name", "cocoindex-pg", "-e", "POSTGRES_PASSWORD=postgres", "-e", "POSTGRES_DB=cocoindex", "-p", "5432:5432", "-d", "postgres"],
            check=False
        )
        time.sleep(5)
    
    os.environ["COCOINDEX_DATABASE_URL"] = "postgres://postgres:postgres@localhost:5432/cocoindex"

def ensure_services_running():
    ensure_qdrant_running()
    ensure_db_running()

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

    ensure_services_running()

    # Prepare CocoIndex flow
    @cocoindex.transform_flow()
    def code_to_embedding(text: cocoindex.DataSlice[str]) -> cocoindex.DataSlice[NDArray[np.float32]]:
        return text.transform(
            cocoindex.functions.SentenceTransformerEmbed(
                model="sentence-transformers/all-MiniLM-L6-v2"
            )
        )

    QDRANT_URL = "http://localhost:6334"
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
