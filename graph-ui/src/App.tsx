import { useEffect, useState, useCallback, useRef } from 'react';
import dagre from 'dagre';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Panel,
  MarkerType,
  addEdge,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import CustomNode from './CustomNode';
import ContainerNode from './ContainerNode';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import NewProjectModal from './NewProjectModal';
import NodeDetailModal from './NodeDetailModal';

const nodeTypes = {
  custom: CustomNode,
  container: ContainerNode,
};

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60 });

  nodes.forEach((node) => {
    // Give enough layout width/height so labels don't bunch up awkwardly
    dagreGraph.setNode(node.id, { width: 100, height: 60 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: 'top',
      sourcePosition: 'bottom',
      position: {
        x: nodeWithPosition.x - 50,
        y: nodeWithPosition.y - 30,
      },
    };
  });

  return { nodes: newNodes, edges };
};

let idCounter = 0;
const getId = () => `dndnode_${idCounter++}`;

const API = 'http://localhost:8833';

function ArchitectureFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(
    () => localStorage.getItem('selectedProject')
  );
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingNode, setEditingNode] = useState<{ id: string; data: any } | null>(null);
  const [hasUnimplementedEdits, setHasUnimplementedEdits] = useState(false);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getIntersectingNodes } = useReactFlow();

  const setAndPersistProject = useCallback((slug: string) => {
    localStorage.setItem('selectedProject', slug);
    setSelectedProject(slug);
  }, []);

  const loadProjects = useCallback(async (selectSlug?: string) => {
    try {
      const res = await fetch(`${API}/api/architectures`);
      const data = await res.json();
      const list: string[] = data.architectures ?? [];
      setProjects(list);
      const stored = localStorage.getItem('selectedProject');
      if (selectSlug && list.includes(selectSlug)) {
        setAndPersistProject(selectSlug);
      } else if (stored && list.includes(stored)) {
        setSelectedProject(stored); // already in state, just ensure list is valid
      } else if (list.length > 0) {
        setAndPersistProject(list[0]);
      }
    } catch (e) {
      console.error('Failed to load architectures', e);
    }
  }, [setAndPersistProject]);

  // Load available projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const applyDiagramData = useCallback((graphData: any) => {
    if (!graphData.nodes || !graphData.edges) {
      console.error("Invalid graph data format:", graphData);
      return;
    }
    const initialNodes = graphData.nodes.map((node: any) => ({
      id: node.id,
      type: 'custom',
      data: {
        label: node.label || node.name || node.id,
        path: node.path,
        description: node.description,
        tier: node.tier,
        onDoubleClick: () => setEditingNode({ id: node.id, data: { label: node.label || node.name || node.id, path: node.path, description: node.description, tier: node.tier } }),
      },
      position: { x: 0, y: 0 }
    }));
    const initialEdges = graphData.edges.map((edge: any) => ({
      id: `${edge.source}-${edge.type}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      label: edge.type,
      animated: true,
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      labelStyle: { fill: '#cbd5e1', fontWeight: 600, fontSize: 7 },
      labelBgStyle: { fill: '#1e293b' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
    }));
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [setNodes, setEdges]);

  // When a project is selected, load its graph
  useEffect(() => {
    if (!selectedProject) return;
    fetch(`${API}/api/architectures/${selectedProject}`)
      .then(r => r.json())
      .then(data => applyDiagramData(data))
      .catch(e => console.error('Failed to load diagram', e));
  }, [selectedProject, applyDiagramData]);

  // Hooking up the ability to connect edges manually
  const onConnect = useCallback(
    (params: any) => {
      // Style connecting edges to look identical to the auto-generated ones
      const edge = {
        ...params,
        animated: true,
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        labelStyle: { fill: '#cbd5e1', fontWeight: 600, fontSize: 7 },
        labelBgStyle: { fill: '#1e293b' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: any) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: any) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) return;

      const type = event.dataTransfer.getData('application/reactflow');
      const tier = event.dataTransfer.getData('application/reactflow-tier');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      // Convert pixel drop coordinates into SVG coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const tierLabels: Record<string, string> = {
        'Core': 'New Core Service',
        'Supporting': 'New Supporting Tool',
        'Dev': 'New Dev Setup',
        'External': 'New External API',
      };

      const newNodeId = getId();
      const newNodeData = {
        label: type === 'container' ? 'Container' : (tierLabels[tier] || 'New Node'),
        tier: tier,
        description: type === 'container' ? 'Group of services' : '',
        path: '',
        onDoubleClick: () => setEditingNode({ id: newNodeId, data: newNodeData }),
      };

      const newNode: any = {
        id: newNodeId,
        type,
        position,
        data: newNodeData,
      };

      if (type === 'container') {
        newNode.style = { width: 300, height: 200 };
        newNode.zIndex = -10;
      }

      setNodes((nds) => {
        // Find if we dropped onto an existing container immediately
        const containerHit = nds.find(n =>
          n.type === 'container' &&
          n.position.x <= position.x && position.x <= n.position.x + (n.style?.width || 300) &&
          n.position.y <= position.y && position.y <= n.position.y + (n.style?.height || 200)
        );

        if (containerHit && type !== 'container') {
          newNode.parentId = containerHit.id;
          newNode.position = {
            x: position.x - containerHit.position.x,
            y: position.y - containerHit.position.y
          };
          newNode.extent = 'parent';
        }

        return nds.concat(newNode);
      });
    },
    [screenToFlowPosition, setNodes]
  );

  const onNodeDragStop = useCallback(
    (_: any, node: any) => {
      if (node.type === 'container') return;

      const intersections = getIntersectingNodes(node).filter((n) => n.type === 'container');
      const containerNode = intersections[0];

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === node.id) {
            if (containerNode && n.parentId !== containerNode.id) {
              // Moving into a new container
              const oldParent = n.parentId ? nds.find((p) => p.id === n.parentId) : null;
              const absX = oldParent ? node.position.x + oldParent.position.x : node.position.x;
              const absY = oldParent ? node.position.y + oldParent.position.y : node.position.y;

              n.parentId = containerNode.id;
              n.position = {
                x: absX - containerNode.position.x,
                y: absY - containerNode.position.y,
              };
              n.extent = 'parent';
            } else if (!containerNode && n.parentId) {
              // Moving out of the container
              const oldParent = nds.find((p) => p.id === n.parentId);
              n.parentId = undefined;
              n.extent = undefined;
              if (oldParent) {
                n.position = {
                  x: node.position.x + oldParent.position.x,
                  y: node.position.y + oldParent.position.y,
                };
              }
            }
          }
          return n;
        })
      );
    },
    [getIntersectingNodes, setNodes]
  );

  return (
    <div className="h-screen flex flex-row w-screen bg-slate-900 overflow-hidden">
      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onProjectCreated={(slug) => loadProjects(slug)}
        />
      )}
      {editingNode && (
        <NodeDetailModal
          nodeId={editingNode.id}
          data={editingNode.data}
          onClose={() => setEditingNode(null)}
          onSave={(nodeId, newData) => {
            setNodes(nds => nds.map(n =>
              n.id === nodeId
                ? { ...n, data: { ...newData, onDoubleClick: () => setEditingNode({ id: nodeId, data: newData }) } }
                : n
            ));
          }}
        />
      )}
      <Sidebar />
      <div className="flex-1 h-full" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
        >
          <Controls />
          <MiniMap nodeColor="#475569" maskColor="rgba(15, 23, 42, 0.8)" />
          <Background variant={BackgroundVariant.Dots} gap={16} size={2} color="#334155" />

          <Panel position="top-left" className="bg-slate-800 text-white p-4 rounded-xl shadow-xl border border-slate-700 w-80">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-xl font-bold">Architectures</h1>
              {hasUnimplementedEdits && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Unimplemented diagram edits" />
              )}
            </div>
            {projects.length === 0 ? (
              <p className="text-slate-400 text-xs mb-3">No projects yet. Add one to get started.</p>
            ) : (
              <>
                <label className="text-xs uppercase font-bold text-gray-400 tracking-wider">Select Project</label>
                <select
                  className="mt-1 w-full p-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                  value={selectedProject || ''}
                  onChange={(e) => setAndPersistProject(e.target.value)}
                >
                  {projects.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </>
            )}
            <button
              onClick={() => setShowNewProject(true)}
              className="mt-3 w-full py-1.5 text-xs font-bold bg-slate-700 hover:bg-blue-600 border border-slate-600 hover:border-blue-500 text-slate-200 rounded-lg transition-colors"
            >
              + New Project
            </button>
          </Panel>

        </ReactFlow>
      </div>
      <ChatPanel
        selectedProject={selectedProject}
        onDiagramUpdate={applyDiagramData}
        onUnimplementedEditsChange={setHasUnimplementedEdits}
      />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <ArchitectureFlow />
    </ReactFlowProvider>
  );
}
