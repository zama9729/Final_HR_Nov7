import React, { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

type HrNodeData = {
  label: string;
  typeKey: string;
  props?: Record<string, any>;
};

function BaseNode({ data }: { data: HrNodeData }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2 shadow-sm min-w-[180px]">
      <div className="text-sm font-medium">{data.label}</div>
      <div className="text-[11px] text-muted-foreground">{data.typeKey}</div>
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Left} />
    </div>
  );
}

const nodeTypes = { base: BaseNode } as const;

const InnerCanvas = React.forwardRef<{ openSave: () => void; runPreview: () => Promise<void> }, {}>(function InnerCanvas(_props, ref) {
  const [nodes, setNodes, onNodesChange] = useNodesState([] as any);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any);
  const [configOpen, setConfigOpen] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftProps, setDraftProps] = useState<Record<string, any>>({});
  const activeNode = useMemo(() => nodes.find(n => n.id === activeNodeId), [nodes, activeNodeId]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reactFlow = useReactFlow();
  const [saveOpen, setSaveOpen] = useState(false);
  useImperativeHandle(ref, () => ({
    openSave: () => setSaveOpen(true),
    runPreview
  }), [nodes, edges]);
  const [saveName, setSaveName] = useState('New Workflow');
  const [saveDesc, setSaveDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const onConnect = useCallback((connection: any) => setEdges((eds: any) => addEdge({ ...connection, animated: true }, eds)), [setEdges]);

  const runPreview = useCallback(async () => {
    const token = api.token || localStorage.getItem('auth_token');
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/workflows/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ workflow: { nodes: nodes.map((n: any) => ({ id: n.id, type: n.data.typeKey, label: n.data.label, x: n.position.x, y: n.position.y, props: n.data.props })), connections: edges.map((e: any) => ({ from: String(e.source), to: String(e.target) })) } })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || 'Preview failed');
    alert(`Steps:\n${JSON.stringify(data.steps, null, 2)}\n\nApprovals:\n${JSON.stringify(data.approvals, null, 2)}`);
  }, [nodes, edges]);

  const addNode = (typeKey: string, label: string, x = 250, y = 100) => {
    const id = `n_${Date.now()}`;
    setNodes((nds: any) => nds.concat({ id, type: 'base', position: { x, y }, data: { label, typeKey } }));
  };

  const openConfig = (nodeId: string) => {
    setActiveNodeId(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    setDraftLabel(node?.data.label || '');
    setDraftProps({ ...(node?.data.props || {}) });
    setConfigOpen(true);
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const typeKey = event.dataTransfer.getData('nodeType');
    const label = event.dataTransfer.getData('nodeName') || typeKey;
    if (!typeKey) return;

    const bounds = wrapperRef.current?.getBoundingClientRect();
    const x = event.clientX - (bounds?.left || 0);
    const y = event.clientY - (bounds?.top || 0);
    const position = reactFlow.project({ x, y });

    const id = `n_${Date.now()}`;
    setNodes((nds: any) => nds.concat({ id, type: 'base', position, data: { label, typeKey } }));
  }, [reactFlow, setNodes]);

  return (
    <div ref={wrapperRef} className="h-full w-full relative" onDragOver={onDragOver} onDrop={onDrop}>
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => addNode('trigger_leave', 'Trigger: Leave Request', 100, 100)}>+ Trigger</Button>
        <Button variant="secondary" size="sm" onClick={() => addNode('approval_manager', 'Approval: Manager', 350, 100)}>+ Manager Approval</Button>
        <Button variant="secondary" size="sm" onClick={() => addNode('approval_hr', 'Approval: HR', 600, 100)}>+ HR Approval</Button>
        <Button variant="secondary" size="sm" onClick={() => addNode('condition', 'Condition', 350, 220)}>+ Condition</Button>
      </div>
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setNodes([]); setEdges([]); }}
          disabled={nodes.length === 0 && edges.length === 0}
        >Clear Canvas</Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const json = JSON.stringify({ nodes, edges }, null, 2);
            const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            const a = document.createElement('a'); a.href = url; a.download = 'workflow.json'; a.click(); URL.revokeObjectURL(url);
          }}
          disabled={nodes.length === 0}
        >Export JSON</Button>
        <Button
          size="sm"
          onClick={async () => { try { await runPreview(); } catch (e: any) { alert(e?.message || 'Preview failed'); } }}
          disabled={nodes.length === 0}
        >Run Preview</Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onNodeDoubleClick={(_, node) => openConfig(node.id)}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background gap={16} />
      </ReactFlow>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save & Publish Workflow</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <div className="mb-1 font-medium">Name</div>
              <Input value={saveName} onChange={e => setSaveName(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 font-medium">Description (optional)</div>
              <Textarea value={saveDesc} onChange={e => setSaveDesc(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
              <Button size="sm" disabled={saving || !saveName.trim()} onClick={async () => {
                try {
                  setSaving(true);
                  const token = api.token || localStorage.getItem('auth_token');
                  const payload = {
                    name: saveName.trim(),
                    description: saveDesc.trim() || undefined,
                    status: 'draft',
                    workflow: {
                      nodes: nodes.map((n: any) => ({ id: n.id, type: (n.data as any).typeKey, label: (n.data as any).label, x: n.position.x, y: n.position.y, props: (n.data as any).props })),
                      connections: edges.map((e: any) => ({ from: String(e.source), to: String(e.target) }))
                    }
                  };
                  const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/workflows`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
                    body: JSON.stringify(payload)
                  });
                  const data = await resp.json();
                  if (!resp.ok) throw new Error(data?.error || 'Save failed');
                  setSaveOpen(false);
                  setSaving(false);
                  alert('Workflow saved');
                } catch (e: any) {
                  setSaving(false);
                  alert(e?.message || 'Save failed');
                }
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configure Node</DialogTitle></DialogHeader>
          {!activeNode ? null : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="mb-1 font-medium">Label</div>
                <Input value={draftLabel} onChange={e => setDraftLabel(e.target.value)} />
              </div>
              {String(activeNode?.data.typeKey).startsWith('approval_') && (
                <div>
                  <div className="mb-1 font-medium">Approver Role</div>
                  <Select value={draftProps.approverRole} onValueChange={v => setDraftProps(p => ({ ...p, approverRole: v }))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(activeNode?.data.typeKey === 'condition' || String(activeNode?.data.typeKey).startsWith('policy_check')) && (
                <div>
                  <div className="mb-1 font-medium">Rule (e.g. days &gt; 10)</div>
                  <Input value={draftProps.rule || ''} onChange={e => setDraftProps(p => ({ ...p, rule: e.target.value }))} />
                </div>
              )}
              {activeNode?.data.typeKey === 'notify' && (
                <div>
                  <div className="mb-1 font-medium">Notification Message</div>
                  <Textarea value={draftProps.message || ''} onChange={e => setDraftProps(p => ({ ...p, message: e.target.value }))} />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" onClick={() => {
                  setNodes((nds: any) => nds.map((n: any) => n.id === (activeNode as any).id ? ({ ...n, data: { ...n.data, label: draftLabel, props: draftProps } }) : n));
                  setConfigOpen(false);
                }}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setConfigOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});

export type N8nWorkflowCanvasHandle = { openSave: () => void; runPreview: () => Promise<void> };

export default React.forwardRef<N8nWorkflowCanvasHandle, {}>(function N8nWorkflowCanvas(_props, ref) {
  return (
    <ReactFlowProvider>
      <InnerCanvas ref={ref as any} />
    </ReactFlowProvider>
  );
});


