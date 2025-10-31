import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Play } from "lucide-react";
import { InteractiveWorkflowCanvas } from "@/components/workflow/InteractiveWorkflowCanvas";
import N8nWorkflowCanvas, { N8nWorkflowCanvasHandle } from "@/components/workflow/N8nWorkflowCanvas";
import { WorkflowToolbox } from "@/components/workflow/WorkflowToolbox";
import { useRef, useState } from "react";

export default function WorkflowEditor() {
  const [workflowName, setWorkflowName] = useState("New Workflow");
  const canvasRef = useRef<N8nWorkflowCanvasHandle | null>(null);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="text-2xl font-bold h-auto border-none p-0 focus-visible:ring-0"
            />
            <p className="text-muted-foreground">Design your automation workflow</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Play className="mr-2 h-4 w-4" />
              Test Run
            </Button>
            <Button onClick={() => canvasRef.current?.openSave()}>
              <Save className="mr-2 h-4 w-4" />
              Save & Publish
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-[300px_1fr] gap-6 h-[calc(100vh-16rem)]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Toolbox</CardTitle>
              <CardDescription>Drag nodes to canvas</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <WorkflowToolbox />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-0 h-full">
              {/* Use the n8n-like canvas with React Flow for connections */}
              <N8nWorkflowCanvas ref={canvasRef} />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
