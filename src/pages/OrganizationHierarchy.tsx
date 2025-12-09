import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import HierarchyBuilder from "@/components/hierarchy/HierarchyBuilder";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Node, Edge } from "reactflow";

export default function OrganizationHierarchy() {
    const [designations, setDesignations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        fetchDesignations();
    }, []);

    const fetchDesignations = async () => {
        try {
            const data = await api.getDesignations();
            setDesignations(data);
        } catch (error) {
            console.error("Failed to fetch designations:", error);
            toast({
                title: "Error",
                description: "Failed to load organization hierarchy",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (nodes: Node[], edges: Edge[]) => {
        try {
            // 1. Handle new nodes (create designations)
            const newNodes = nodes.filter(n => n.id.startsWith('new_'));
            const createdDesignationsMap = new Map<string, string>(); // tempId -> realId

            // Refetch current designations to ensure we have the latest list
            const currentDesignations = await api.getDesignations();
            const designationNameMap = new Map(currentDesignations.map((d: any) => [d.name.toLowerCase(), d.id]));

            for (const node of newNodes) {
                const nodeLabel = node.data.label.trim();

                // Check if designation already exists (case-insensitive)
                if (designationNameMap.has(nodeLabel.toLowerCase())) {
                    const existingId = designationNameMap.get(nodeLabel.toLowerCase());
                    createdDesignationsMap.set(node.id, existingId.toString());

                    // Update the existing designation with new level if needed
                    await api.updateDesignation(existingId, {
                        level: node.data.level
                    });
                } else {
                    // Create new if doesn't exist
                    const newDesignation = await api.createDesignation({
                        name: nodeLabel,
                        level: node.data.level,
                        // Parent will be set later via edges
                    });
                    createdDesignationsMap.set(node.id, newDesignation.id.toString());
                }
            }

            // 2. Update hierarchy (parent relationships) based on edges
            const updates = [];

            // Map edges to parent-child relationships
            for (const edge of edges) {
                let sourceId = edge.source;
                let targetId = edge.target;

                // Resolve temp IDs if they were just created
                if (createdDesignationsMap.has(sourceId)) sourceId = createdDesignationsMap.get(sourceId)!;
                if (createdDesignationsMap.has(targetId)) targetId = createdDesignationsMap.get(targetId)!;

                // If either ID is still a temp ID (shouldn't happen if logic is correct), skip
                if (sourceId.startsWith('new_') || targetId.startsWith('new_')) continue;

                updates.push({
                    id: parseInt(targetId),
                    parent_designation_id: parseInt(sourceId)
                });
            }

            // Also handle nodes that have NO incoming edges (roots)
            const childNodeIds = new Set(edges.map(e => e.target));
            const rootNodes = nodes.filter(n => !childNodeIds.has(n.id));

            for (const node of rootNodes) {
                let nodeId = node.id;
                if (createdDesignationsMap.has(nodeId)) nodeId = createdDesignationsMap.get(nodeId)!;

                if (!nodeId.startsWith('new_')) {
                    updates.push({
                        id: parseInt(nodeId),
                        parent_designation_id: null
                    });
                }
            }

            // Execute updates
            // Ideally this should be a bulk update API, but for now we'll loop
            // Optimisation: Only update if changed
            for (const update of updates) {
                await api.updateDesignation(update.id, { parent_designation_id: update.parent_designation_id });
            }

            toast({
                title: "Success",
                description: "Hierarchy saved successfully",
            });

            // Refresh data
            fetchDesignations();

        } catch (error) {
            console.error("Failed to save hierarchy:", error);
            throw error; // Propagate to HierarchyBuilder for error toast
        }
    };

    if (loading) {
        return (
            <AppLayout>
                <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="h-[calc(100vh-4rem)]">
                <HierarchyBuilder
                    initialDesignations={designations}
                    onSave={handleSave}
                />
            </div>
        </AppLayout>
    );
}
