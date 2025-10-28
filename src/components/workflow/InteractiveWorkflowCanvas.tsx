import { useState, useRef, useCallback } from "react";
import { Play, GitBranch, User, Mail, Clock, Code, Webhook, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Node {
  id: string;
  type: string;
  x: number;
  y: number;
  label: string;
}

interface Connection {
  from: string;
  to: string;
}

const nodeTypes = [
  { id: "trigger", name: "Trigger", icon: Play, color: "text-primary" },
  { id: "condition", name: "Condition", icon: GitBranch, color: "text-warning" },
  { id: "approver", name: "Approver", icon: User, color: "text-accent" },
  { id: "email", name: "Email", icon: Mail, color: "text-blue-500" },
  { id: "delay", name: "Delay", icon: Clock, color: "text-purple-500" },
  { id: "script", name: "Script", icon: Code, color: "text-orange-500" },
  { id: "webhook", name: "Webhook", icon: Webhook, color: "text-pink-500" },
];

export function InteractiveWorkflowCanvas() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const getNodeIcon = (type: string) => {
    return nodeTypes.find(nt => nt.id === type)?.icon || Play;
  };

  const getNodeColor = (type: string) => {
    return nodeTypes.find(nt => nt.id === type)?.color || "text-primary";
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const type = e.dataTransfer.getData("nodeType");
    const name = e.dataTransfer.getData("nodeName");
    
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type,
      x: e.clientX - rect.left - 75,
      y: e.clientY - rect.top - 40,
      label: name,
    };

    setNodes(prev => [...prev, newNode]);
  }, []);

  const handleNodeMouseDown = (e: React.MouseEvent, node: Node) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setDraggedNode(node);
    setSelectedNode(node.id);
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggedNode || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const newX = e.clientX - rect.left - dragOffset.x;
    const newY = e.clientY - rect.top - dragOffset.y;

    setNodes(prev =>
      prev.map(n =>
        n.id === draggedNode.id ? { ...n, x: newX, y: newY } : n
      )
    );
  }, [draggedNode, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setDraggedNode(null);
  }, []);

  const handleDeleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
    setSelectedNode(null);
  };

  const handleClearCanvas = () => {
    setNodes([]);
    setConnections([]);
    setSelectedNode(null);
  };

  return (
    <div className="relative w-full h-full">
      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleClearCanvas}
          disabled={nodes.length === 0}
        >
          Clear Canvas
        </Button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative w-full h-full bg-muted/20 overflow-hidden"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:24px_24px]" />

        {/* Connections */}
        <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          {connections.map((conn, idx) => {
            const fromNode = nodes.find(n => n.id === conn.from);
            const toNode = nodes.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return null;

            return (
              <line
                key={idx}
                x1={fromNode.x + 75}
                y1={fromNode.y + 40}
                x2={toNode.x + 75}
                y2={toNode.y + 40}
                stroke="hsl(var(--border))"
                strokeWidth="2"
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => {
          const Icon = getNodeIcon(node.type);
          const color = getNodeColor(node.type);
          const isSelected = selectedNode === node.id;

          return (
            <div
              key={node.id}
              className={`absolute p-4 bg-card rounded-lg shadow-medium hover:shadow-large transition-all cursor-move select-none ${
                isSelected ? 'border-2 border-primary ring-2 ring-primary/20' : 'border-2 border-transparent'
              }`}
              style={{ 
                left: `${node.x}px`, 
                top: `${node.y}px`,
                zIndex: draggedNode?.id === node.id ? 100 : 2,
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
            >
              <div className="flex items-center gap-3 min-w-[120px]">
                <div className={`h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{node.label}</p>
                  <p className="text-xs text-muted-foreground capitalize">{node.type}</p>
                </div>
                {isSelected && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 -mr-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNode(node.id);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* Helper text */}
        {nodes.length === 0 && (
          <div className="absolute bottom-4 left-4 p-3 bg-card/90 backdrop-blur-sm rounded-lg border text-sm text-muted-foreground">
            <p>💡 Drag nodes from the toolbox to build your workflow</p>
          </div>
        )}
      </div>
    </div>
  );
}