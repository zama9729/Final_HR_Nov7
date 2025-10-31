import { useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Play, GitBranch, User, Mail, Clock, Code, Webhook, X, CheckCircle2, FileText, Bell, ClipboardCheck, SplitSquareHorizontal, Building2, FileCheck2, ShieldCheck, DollarSign, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../ui/select";

interface Node {
  id: string;
  type: string;
  x: number;
  y: number;
  label: string;
  props?: Record<string, any>;
}

interface Connection {
  from: string;
  to: string;
}

// Organization-level HR nodes (must match toolbox)
const nodeTypes = [
  { id: "trigger_leave", name: "Trigger: Leave Request", icon: Play, color: "text-primary" },
  { id: "trigger_expense", name: "Trigger: Expense Claim", icon: DollarSign, color: "text-primary" },
  { id: "trigger_onboarding", name: "Trigger: Onboarding", icon: Building2, color: "text-primary" },

  { id: "policy_check_leave", name: "Check Leave Policy", icon: ShieldCheck, color: "text-emerald-600" },
  { id: "policy_check_expense", name: "Check Expense Policy", icon: ShieldCheck, color: "text-emerald-600" },

  { id: "approval_manager", name: "Approval: Manager", icon: User, color: "text-accent" },
  { id: "approval_hr", name: "Approval: HR", icon: ClipboardCheck, color: "text-accent" },
  { id: "approval_finance", name: "Approval: Finance", icon: DollarSign, color: "text-accent" },

  { id: "notify", name: "Notify (Email/In-App)", icon: Bell, color: "text-blue-500" },
  { id: "assign_task", name: "Assign Task", icon: ClipboardCheck, color: "text-purple-600" },
  { id: "audit_log", name: "Log Approval/Audit", icon: FileText, color: "text-orange-500" },
  { id: "generate_doc", name: "Generate Document", icon: FileCheck2, color: "text-teal-600" },
  { id: "update_status", name: "Update Status", icon: Workflow, color: "text-sky-600" },
  { id: "escalate", name: "Escalate After Delay", icon: Clock, color: "text-purple-500" },

  { id: "condition", name: "Condition / Branch", icon: GitBranch, color: "text-warning" },
  { id: "parallel", name: "Parallel Approvals", icon: SplitSquareHorizontal, color: "text-pink-600" },

  { id: "complete", name: "Mark Complete", icon: CheckCircle2, color: "text-emerald-600" },
];

export function InteractiveWorkflowCanvas() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [configNodeId, setConfigNodeId] = useState<string | null>(null); // for config modal
  const [configDraftLabel, setConfigDraftLabel] = useState<string>('');
  const [configDraftProps, setConfigDraftProps] = useState<Record<string, any>>({});
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null); // node id
  const [connectIndicator, setConnectIndicator] = useState<{ x: number, y: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
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

  // Mousedown: either select/drag, or begin connection
  const handleNodeMouseDown = (e: React.MouseEvent, node: Node) => {
    e.stopPropagation();
    // Right-click or handle: start connect
    if (e.button === 2 || (e.target as HTMLElement).classList.contains("workflow-node-handle")) {
      setConnectingFrom(node.id);
      return;
    }
    // Otherwise, drag node
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setDraggedNode(node);
    setSelectedNode(node.id);
  };

  // Double-click to show config modal
  const handleNodeDoubleClick = (e: React.MouseEvent, node: Node) => {
    e.stopPropagation();
    setConfigNodeId(node.id);
    setConfigDraftLabel(node.label);
    setConfigDraftProps({ ...(node.props || {}) });
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            // Export nodes/connections as JSON file
            const json = JSON.stringify({ nodes, connections }, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'workflow.json';
            a.click();
            URL.revokeObjectURL(url);
          }}
          disabled={nodes.length === 0}
        >
          Export JSON
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={async () => {
            try {
              const token = api.token || localStorage.getItem('auth_token');
              const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/workflows/execute`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ workflow: { nodes, connections } })
              });
              const data = await resp.json();
              if (!resp.ok) throw new Error(data?.error || 'Preview failed');
              setPreviewData(data);
              setPreviewOpen(true);
            } catch (e: any) {
              setPreviewData({ error: e.message || 'Preview failed' });
              setPreviewOpen(true);
            }
          }}
          disabled={nodes.length === 0}
        >
          Run Preview
        </Button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative w-full h-full bg-muted/20 overflow-hidden"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onMouseMove={e => {
          handleMouseMove(e);
          // For connection preview
          if (connectingFrom) {
            if (canvasRef.current) {
              const rect = canvasRef.current.getBoundingClientRect();
              setConnectIndicator({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }
          }
        }}
        onMouseUp={e => {
          handleMouseUp();
          // On connection complete
          if (connectingFrom) {
            // Get node under cursor
            if (canvasRef.current) {
              const rect = canvasRef.current.getBoundingClientRect();
              const mx = e.clientX - rect.left, my = e.clientY - rect.top;
              const toNode = nodes.find(n => {
                return (
                  mx >= n.x &&
                  mx <= n.x + 150 &&
                  my >= n.y &&
                  my <= n.y + 50
                );
              });
              if (toNode && toNode.id !== connectingFrom) {
                setConnections(prev => prev.concat({ from: connectingFrom, to: toNode.id }));
              }
              setConnectingFrom(null);
              setConnectIndicator(null);
            }
          }
        }}
        onMouseLeave={e => {
          handleMouseUp();
          setConnectIndicator(null);
        }}
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
                y1={fromNode.y + 25}
                x2={toNode.x + 75}
                y2={toNode.y + 25}
                stroke="hsl(var(--border))"
                strokeWidth="2"
              />
            );
          })}
          {/* Connection preview */}
          {connectingFrom && connectIndicator && (() => {
            const fromNode = nodes.find(n => n.id === connectingFrom);
            if (!fromNode) return null;
            return (
              <line
                x1={fromNode.x + 150}
                y1={fromNode.y + 25}
                x2={connectIndicator.x}
                y2={connectIndicator.y}
                stroke="#0070f3"
                strokeWidth="2"
                strokeDasharray="2 3"
              />
            );
          })()}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => {
          const Icon = getNodeIcon(node.type);
          const color = getNodeColor(node.type);
          const isSelected = selectedNode === node.id;

          return (
            <div
              key={node.id}
              className={`absolute p-4 bg-card rounded-lg shadow-medium hover:shadow-large select-none ${
                isSelected ? 'border-2 border-primary ring-2 ring-primary/20' : 'border-2 border-muted'
              }`}
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                zIndex: draggedNode?.id === node.id ? 100 : 2,
                width: 180,
                height: 60,
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
            >
              <div className="flex items-center gap-3 min-w-[120px] relative">
                {/* Drag/Config handle */}
                <div className={`h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{node.label}</p>
                  <p className="text-xs text-muted-foreground capitalize">{node.type}</p>
                </div>
                {/* Connect handle */}
                <div
                  className="workflow-node-handle absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-primary cursor-crosshair hover:scale-125"
                  style={{ right: -12, border: '2px solid #0070f3' }}
                  title="Drag to connect"
                  onMouseDown={e => {
                    e.stopPropagation();
                    setConnectingFrom(node.id);
                  }}
                />
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

      {/* Node config modal */}
      <Dialog open={!!configNodeId} onOpenChange={open => { if (!open) setConfigNodeId(null); }}>
        <DialogContent>
          {(() => {
            const node = nodes.find(n => n.id === configNodeId);
            if (!node) return null;
            const type = node.type;
            return (
              <div className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Configure {configDraftLabel || node.label}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  <label className="font-medium text-sm">Label</label>
                  <Input value={configDraftLabel} onChange={e => setConfigDraftLabel(e.target.value)} />
                </div>

                {type.startsWith('approval') && (
                  <div className="space-y-2">
                    <label className="font-medium text-sm">Approver Role</label>
                    <Select value={configDraftProps.approverRole} onValueChange={v => setConfigDraftProps(p=>({ ...p, approverRole: v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="hr">HR</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(type === 'condition' || type.startsWith('policy_check')) && (
                  <div className="space-y-2">
                    <label className="font-medium text-sm">Rule (e.g. days &gt; 10)</label>
                    <Input value={configDraftProps.rule || ''} onChange={e => setConfigDraftProps(p=>({ ...p, rule:e.target.value }))} />
                  </div>
                )}

                {type === 'notify' && (
                  <div className="space-y-2">
                    <label className="font-medium text-sm">Notification Message</label>
                    <Textarea value={configDraftProps.message || ''} onChange={e => setConfigDraftProps(p=>({ ...p, message:e.target.value }))} />
                  </div>
                )}

                {type === 'escalate' && (
                  <div className="space-y-2">
                    <label className="font-medium text-sm">Escalate If No Action After (days)</label>
                    <Input type="number" value={configDraftProps.delay || ''} onChange={e => setConfigDraftProps(p=>({ ...p, delay: +e.target.value }))} />
                  </div>
                )}

                <div className="flex gap-2 justify-end mt-4">
                  <Button variant="default" onClick={() => {
                    setNodes(prev => prev.map(n => n.id === node.id ? { ...n, label: configDraftLabel, props: { ...(configDraftProps || {}) } } : n));
                    setConfigNodeId(null);
                  }}>Save</Button>
                  <Button variant="outline" onClick={() => setConfigNodeId(null)}>Cancel</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* Preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Workflow Preview</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto text-sm space-y-3">
            {previewData?.error ? (
              <div className="text-red-600">{String(previewData.error)}</div>
            ) : (
              <>
                <div>
                  <p className="font-medium mb-1">Steps</p>
                  <pre className="bg-muted p-2 rounded overflow-auto">{JSON.stringify(previewData?.steps || [], null, 2)}</pre>
                </div>
                <div>
                  <p className="font-medium mb-1">Approvals</p>
                  <pre className="bg-muted p-2 rounded overflow-auto">{JSON.stringify(previewData?.approvals || [], null, 2)}</pre>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}