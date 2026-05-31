import { useMemo } from 'react';
import { ReactFlow, Background, Controls, Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface AgentFlowProps {
  config: any;
}

export function AgentFlow({ config }: AgentFlowProps) {
  const { nodes, edges } = useMemo(() => {
    const initialNodes: Node[] = [];
    const initialEdges: Edge[] = [];
    let yOffset = 100;

    // Main Agent Node
    const mainId = 'agent-main';
    initialNodes.push({
      id: mainId,
      position: { x: 250, y: 50 },
      data: { label: config?.multi_agent ? 'Multi-Agent Orchestrator' : 'Primary Agent' },
      style: { background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 'bold' }
    });

    if (config?.tools && Array.isArray(config.tools)) {
      config.tools.forEach((tool: string, index: number) => {
        const toolId = `tool-${index}`;
        initialNodes.push({
          id: toolId,
          position: { x: 100 + (index * 150), y: 150 },
          data: { label: `Tool: ${tool}` },
          style: { background: '#10b981', color: 'white', border: 'none', borderRadius: '4px' }
        });
        initialEdges.push({
          id: `e-${mainId}-${toolId}`,
          source: mainId,
          target: toolId,
          animated: true,
          style: { stroke: '#94a3b8' }
        });
      });
      yOffset += 100;
    }

    if (config?.databases && Array.isArray(config.databases)) {
        config.databases.forEach((db: string, index: number) => {
            const dbId = `db-${index}`;
            initialNodes.push({
                id: dbId,
                position: { x: 100 + (index * 150), y: 250 },
                data: { label: `DB: ${db}` },
                style: { background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px' }
            });
            initialEdges.push({
                id: `e-${mainId}-${dbId}`,
                source: mainId,
                target: dbId,
                animated: true,
                style: { stroke: '#94a3b8' }
            });
        });
    }

    return { nodes: initialNodes, edges: initialEdges };
  }, [config]);

  if (!config) {
    return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
            No agent config provided for this project. Update the config to see the architecture flow.
        </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '500px' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background color="#ccc" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
