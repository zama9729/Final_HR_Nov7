import { useCallback, useState, useRef, useEffect } from 'react';
import ReactFlow, {
    addEdge,
    Connection,
    Edge,
    Node,
    useNodesState,
    useEdgesState,
    ReactFlowProvider,
    Controls,
    Background,
    Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { HierarchySidebar } from './HierarchySidebar';
import HierarchyNode from './HierarchyNode';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const nodeTypes = {
    hierarchyNode: HierarchyNode,
};

const nodeWidth = 280;
const nodeHeight = 100;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = direction === 'LR' ? 'left' : 'top';
        node.sourcePosition = direction === 'LR' ? 'right' : 'bottom';

        // We are shifting the dagre node position (anchor=center center) to the top left
        // so it matches the React Flow node anchor point (top left).
        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };

        return node;
    });

    return { nodes, edges };
};

interface HierarchyBuilderProps {
    initialDesignations: any[];
    onSave: (nodes: Node[], edges: Edge[]) => Promise<void>;
}

export function HierarchyBuilder({ initialDesignations, onSave }: HierarchyBuilderProps) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
    const { toast } = useToast();

    // Edit Dialog State
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ label: '', level: '4' });
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Initialize graph from designations
    useEffect(() => {
        if (initialDesignations.length > 0) {
            const initialNodes: Node[] = initialDesignations.map((d) => ({
                id: d.id.toString(),
                type: 'hierarchyNode',
                data: {
                    label: d.name,
                    level: d.level,
                    employeeCount: d.employee_count,
                    onEdit: (id: string) => handleEditClick(id),
                    onDelete: (id: string) => handleDeleteNode(id),
                },
                position: { x: 0, y: 0 }, // Initial position, will be layouted
            }));

            const initialEdges: Edge[] = initialDesignations
                .filter((d) => d.parent_designation_id)
                .map((d) => ({
                    id: `e${d.parent_designation_id}-${d.id}`,
                    source: d.parent_designation_id.toString(),
                    target: d.id.toString(),
                    type: 'smoothstep',
                    animated: true,
                }));

            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                initialNodes,
                initialEdges
            );

            // Ensure handlers are attached to initial nodes
            const nodesWithHandlers = layoutedNodes.map(node => ({
                ...node,
                data: {
                    ...node.data,
                    onEdit: (id: string) => handleEditClick(id),
                    onDelete: (id: string) => handleDeleteNode(id),
                }
            }));

            setNodes(nodesWithHandlers);
            setEdges(layoutedEdges);
        }
    }, [initialDesignations]);

    const handleEditClick = (id: string) => {
        const node = nodes.find(n => n.id === id);
        if (node) {
            setEditingNodeId(id);
            setEditForm({
                label: node.data.label,
                level: node.data.level.toString()
            });
            setIsDialogOpen(true);
        }
    };

    const handleSaveEdit = () => {
        if (!editingNodeId) return;

        setNodes((nds) => nds.map((node) => {
            if (node.id === editingNodeId) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        label: editForm.label,
                        level: parseInt(editForm.level)
                    }
                };
            }
            return node;
        }));

        setIsDialogOpen(false);
        setEditingNodeId(null);
    };

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true }, eds)),
        [setEdges]
    );

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');
            const label = event.dataTransfer.getData('application/label');

            if (typeof type === 'undefined' || !type) {
                return;
            }

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode: Node = {
                id: `new_${Date.now()}`,
                type,
                position,
                data: {
                    label: label,
                    level: 4, // Default level for new nodes
                    onEdit: (id: string) => handleEditClick(id),
                    onDelete: (id: string) => handleDeleteNode(id),
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [reactFlowInstance, nodes] // added nodes dependency to ensure handlers have correct closure if needed, though handleEditClick is stable
    );

    const onLayout = useCallback(
        (direction: 'TB' | 'LR') => {
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                nodes,
                edges,
                direction
            );

            setNodes([...layoutedNodes]);
            setEdges([...layoutedEdges]);
        },
        [nodes, edges]
    );

    const handleDeleteNode = (nodeId: string) => {
        setNodes((nds) => nds.filter((node) => node.id !== nodeId));
        setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    };

    const handleSave = async () => {
        try {
            await onSave(nodes, edges);
            toast({
                title: "Success",
                description: "Hierarchy saved successfully",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to save hierarchy",
                variant: "destructive",
            });
        }
    };

    // Extract unique roles for sidebar
    const existingRoles = ["CEO", "VP Engineering", "VP Sales", "Director", "Manager", "Team Lead", "Senior Engineer", "Engineer", "Intern"];

    return (
        <div className="flex h-[calc(100vh-4rem)] w-full">
            <HierarchySidebar
                onAddNode={(label) => {
                    const newNode: Node = {
                        id: `new_${Date.now()}`,
                        type: 'hierarchyNode',
                        position: { x: 100, y: 100 },
                        data: {
                            label,
                            level: 4,
                            onEdit: (id: string) => handleEditClick(id),
                            onDelete: (id: string) => handleDeleteNode(id),
                        },
                    };
                    setNodes((nds) => nds.concat(newNode));
                }}
                onLayout={onLayout}
                existingRoles={existingRoles}
            />

            <div className="flex-1 relative" ref={reactFlowWrapper}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onInit={setReactFlowInstance}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    nodeTypes={nodeTypes}
                    fitView
                >
                    <Controls />
                    <Background color="#aaa" gap={16} />
                    <Panel position="top-right">
                        <Button onClick={handleSave} className="gap-2">
                            <Save className="h-4 w-4" />
                            Save Changes
                        </Button>
                    </Panel>
                </ReactFlow>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Designation</DialogTitle>
                        <DialogDescription>
                            Update the details for this role.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Role Name</Label>
                            <Input
                                id="name"
                                value={editForm.label}
                                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="level">Level</Label>
                            <Select
                                value={editForm.level}
                                onValueChange={(value) => setEditForm({ ...editForm, level: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select level" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">Executive (Level 0)</SelectItem>
                                    <SelectItem value="1">VP (Level 1)</SelectItem>
                                    <SelectItem value="2">Director (Level 2)</SelectItem>
                                    <SelectItem value="3">Manager (Level 3)</SelectItem>
                                    <SelectItem value="4">Staff (Level 4)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveEdit}>Update Node</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function HierarchyBuilderWrapper(props: HierarchyBuilderProps) {
    return (
        <ReactFlowProvider>
            <HierarchyBuilder {...props} />
        </ReactFlowProvider>
    );
}
