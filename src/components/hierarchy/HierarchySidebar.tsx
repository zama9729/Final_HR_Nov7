import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    Search,
    Plus,
    LayoutTemplate,
    ArrowDown,
    ArrowRight,
    GripVertical
} from "lucide-react";
import { useState } from "react";

interface HierarchySidebarProps {
    onAddNode: (label: string) => void;
    onLayout: (direction: 'TB' | 'LR') => void;
    existingRoles: string[];
}

export function HierarchySidebar({ onAddNode, onLayout, existingRoles }: HierarchySidebarProps) {
    const [newRole, setNewRole] = useState("");
    const [search, setSearch] = useState("");

    const handleAdd = () => {
        if (newRole.trim()) {
            onAddNode(newRole.trim());
            setNewRole("");
        }
    };

    const filteredRoles = existingRoles.filter(role =>
        role.toLowerCase().includes(search.toLowerCase())
    );

    const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.setData('application/label', label);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div className="w-80 border-r bg-white dark:bg-slate-950 flex flex-col h-full">
            <div className="p-4 space-y-4">
                <div>
                    <h2 className="text-lg font-semibold mb-1">Hierarchy Builder</h2>
                    <p className="text-sm text-muted-foreground">
                        Drag roles to build your organization structure.
                    </p>
                </div>

                <div className="flex gap-2">
                    <Input
                        placeholder="New Role Name"
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <Button size="icon" onClick={handleAdd} disabled={!newRole.trim()}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Auto Layout
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={() => onLayout('TB')}>
                            <ArrowDown className="mr-2 h-3 w-3" /> Vertical
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onLayout('LR')}>
                            <ArrowRight className="mr-2 h-3 w-3" /> Horizontal
                        </Button>
                    </div>
                </div>
            </div>

            <Separator />

            <div className="p-4 flex-1 flex flex-col min-h-0">
                <div className="relative mb-4">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search roles..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                    />
                </div>

                <ScrollArea className="flex-1">
                    <div className="space-y-2">
                        {filteredRoles.map((role, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-grab active:cursor-grabbing transition-colors"
                                draggable
                                onDragStart={(event) => onDragStart(event, 'hierarchyNode', role)}
                            >
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{role}</span>
                            </div>
                        ))}
                        {filteredRoles.length === 0 && (
                            <div className="text-center py-8 text-sm text-muted-foreground">
                                No roles found
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
