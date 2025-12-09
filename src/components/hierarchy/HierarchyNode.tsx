import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2, Users, Network } from "lucide-react";
import { cn } from "@/lib/utils";

interface HierarchyNodeData {
    label: string;
    level: number;
    employeeCount?: number;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
}

const HierarchyNode = ({ data, id, selected }: NodeProps<HierarchyNodeData>) => {
    const getLevelColor = (level: number) => {
        switch (level) {
            case 0: return "border-blue-500 bg-blue-50 dark:bg-blue-950/30"; // CEO
            case 1: return "border-purple-500 bg-purple-50 dark:bg-purple-950/30"; // VP
            case 2: return "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"; // Director
            case 3: return "border-sky-500 bg-sky-50 dark:bg-sky-950/30"; // Manager
            default: return "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"; // Employee
        }
    };

    const getLevelLabel = (level: number) => {
        switch (level) {
            case 0: return "Executive";
            case 1: return "VP";
            case 2: return "Director";
            case 3: return "Manager";
            default: return "Staff";
        }
    };

    return (
        <div className={cn(
            "relative group transition-all duration-200",
            selected && "scale-105 shadow-lg ring-2 ring-blue-500 rounded-lg"
        )}>
            <Handle
                type="target"
                position={Position.Top}
                className="w-3 h-3 bg-slate-400 !border-2 !border-white dark:!border-slate-950"
            />

            <Card className={cn(
                "w-64 border-l-4 shadow-sm hover:shadow-md transition-shadow",
                getLevelColor(data.level)
            )}>
                <CardHeader className="p-3 pb-0 flex flex-row items-start justify-between space-y-0">
                    <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wider bg-white/50 dark:bg-black/20 border-0">
                            {getLevelLabel(data.level)}
                        </Badge>
                        <CardTitle className="text-sm font-bold leading-tight">
                            {data.label}
                        </CardTitle>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-white/50 dark:hover:bg-black/20"
                            onClick={(e) => {
                                e.stopPropagation();
                                data.onEdit(id);
                            }}
                        >
                            <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:bg-red-100 dark:hover:bg-red-900/30"
                            onClick={(e) => {
                                e.stopPropagation();
                                data.onDelete(id);
                            }}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-3 pt-2">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <span>{data.employeeCount || 0}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Network className="h-3 w-3" />
                            <span>Level {data.level}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Handle
                type="source"
                position={Position.Bottom}
                className="w-3 h-3 bg-slate-400 !border-2 !border-white dark:!border-slate-950"
            />
        </div>
    );
};

export default memo(HierarchyNode);
