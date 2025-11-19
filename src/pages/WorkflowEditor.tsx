import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Play, Loader2 } from "lucide-react";
import { InteractiveWorkflowCanvas } from "@/components/workflow/InteractiveWorkflowCanvas";
import N8nWorkflowCanvas, { N8nWorkflowCanvasHandle } from "@/components/workflow/N8nWorkflowCanvas";
import { WorkflowToolbox } from "@/components/workflow/WorkflowToolbox";
import { useRef, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";

export default function WorkflowEditor() {
  const { id } = useParams<{ id: string }>();
  const [workflowName, setWorkflowName] = useState("New Workflow");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [loading, setLoading] = useState(!!id);
  const [workflowData, setWorkflowData] = useState<any>(null);
  const canvasRef = useRef<N8nWorkflowCanvasHandle | null>(null);

  useEffect(() => {
    if (id) {
      const loadWorkflow = async () => {
        try {
          setLoading(true);
          const response = await api.getWorkflow(id);
          const workflow = response.workflow;
          setWorkflowName(workflow.name || "New Workflow");
          setWorkflowDescription(workflow.description || "");
          setWorkflowData(workflow.workflow_json);
        } catch (error: any) {
          console.error("Failed to load workflow:", error);
          alert(`Failed to load workflow: ${error?.message || "Unknown error"}`);
        } finally {
          setLoading(false);
        }
      };
      loadWorkflow();
    }
  }, [id]);

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
            <Button variant="outline" onClick={() => canvasRef.current?.runPreview()}>
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
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <N8nWorkflowCanvas 
                  ref={canvasRef} 
                  initialWorkflow={workflowData} 
                  workflowId={id || undefined}
                  initialName={workflowName}
                  initialDescription={workflowDescription}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
