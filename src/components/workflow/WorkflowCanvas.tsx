import { useState } from "react";
import { Play, GitBranch, User } from "lucide-react";

interface Node {
  id: string;
  type: string;
  x: number;
  y: number;
  label: string;
}

export function WorkflowCanvas() {
  const [nodes] = useState<Node[]>([
    { id: "1", type: "trigger", x: 100, y: 100, label: "Start" },
    { id: "2", type: "condition", x: 300, y: 100, label: "Check Amount > $1000" },
    { id: "3", type: "approver", x: 500, y: 50, label: "Finance Manager" },
    { id: "4", type: "approver", x: 500, y: 150, label: "Direct Manager" },
  ]);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case "trigger":
        return Play;
      case "condition":
        return GitBranch;
      case "approver":
        return User;
      default:
        return Play;
    }
  };

  return (
    <div className="relative w-full h-full bg-muted/20 overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* Connections */}
      <svg className="absolute inset-0 pointer-events-none">
        <line x1="150" y1="120" x2="300" y2="120" stroke="hsl(var(--border))" strokeWidth="2" />
        <line x1="350" y1="120" x2="500" y2="70" stroke="hsl(var(--border))" strokeWidth="2" />
        <line x1="350" y1="120" x2="500" y2="170" stroke="hsl(var(--border))" strokeWidth="2" />
      </svg>

      {/* Nodes */}
      {nodes.map((node) => {
        const Icon = getNodeIcon(node.type);
        return (
          <div
            key={node.id}
            className="absolute p-4 bg-card border-2 border-primary rounded-lg shadow-medium hover:shadow-large transition-all cursor-move"
            style={{ left: `${node.x}px`, top: `${node.y}px` }}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{node.label}</p>
                <p className="text-xs text-muted-foreground capitalize">{node.type}</p>
              </div>
            </div>
          </div>
        );
      })}

      {/* Helper text */}
      <div className="absolute bottom-4 left-4 p-3 bg-card/90 backdrop-blur-sm rounded-lg border text-sm text-muted-foreground">
        <p>💡 Drag nodes from the toolbox to build your workflow</p>
      </div>
    </div>
  );
}
