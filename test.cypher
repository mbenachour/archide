// Automatically generated Neo4j Cypher Script

// -- Constraints / Indexes --
CREATE CONSTRAINT IF NOT EXISTS FOR (c:Component) REQUIRE c.id IS UNIQUE;

// -- Nodes --
MERGE (n:Core {id: "DiagramPy"}) SET n:Component SET n += {id: "DiagramPy", name: "Diagram Generator", tier: "Core", path: "diagram.py", description: "Core execution script parsing Mermaid/Cypher to generate visuals"};
MERGE (n:Supporting {id: "DiagramMmd"}) SET n:Component SET n += {id: "DiagramMmd", name: "Mermaid Definition", tier: "Supporting", path: "diagram.mmd", description: "Input file containing Mermaid syntax definitions"};
MERGE (n:Supporting {id: "TestCypher"}) SET n:Component SET n += {id: "TestCypher", name: "Cypher Query", tier: "Supporting", path: "test.cypher", description: "Input file containing Cypher queries for graph data"};
MERGE (n:Supporting {id: "EnvConfig"}) SET n:Component SET n += {id: "EnvConfig", name: "Environment Config", tier: "Supporting", path: ".env", description: "Configuration file providing runtime environment context"};

// -- Relationships --
MATCH (A {id: "DiagramPy"}), (B {id: "DiagramMmd"}) MERGE (A)-[:READS]->(B);
MATCH (A {id: "DiagramPy"}), (B {id: "TestCypher"}) MERGE (A)-[:READS]->(B);
MATCH (A {id: "DiagramPy"}), (B {id: "EnvConfig"}) MERGE (A)-[:READS]->(B);