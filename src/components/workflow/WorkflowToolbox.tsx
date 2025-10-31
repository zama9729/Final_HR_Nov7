import { Play, GitBranch, User, Mail, Clock, Code, Webhook, CheckCircle2, FileText, Bell, ClipboardCheck, SplitSquareHorizontal, Building2, FileCheck2, ShieldCheck, DollarSign, Workflow } from "lucide-react";

// Organization-level HR toolbox nodes
const nodeTypes = [
  // Triggers
  { id: "trigger_leave", name: "Trigger: Leave Request", icon: Play, color: "text-primary" },
  { id: "trigger_expense", name: "Trigger: Expense Claim", icon: DollarSign, color: "text-primary" },
  { id: "trigger_onboarding", name: "Trigger: Onboarding", icon: Building2, color: "text-primary" },

  // Policy checks
  { id: "policy_check_leave", name: "Check Leave Policy", icon: ShieldCheck, color: "text-emerald-600" },
  { id: "policy_check_expense", name: "Check Expense Policy", icon: ShieldCheck, color: "text-emerald-600" },

  // Approvals
  { id: "approval_manager", name: "Approval: Manager", icon: User, color: "text-accent" },
  { id: "approval_hr", name: "Approval: HR", icon: ClipboardCheck, color: "text-accent" },
  { id: "approval_finance", name: "Approval: Finance", icon: DollarSign, color: "text-accent" },

  // Actions
  { id: "notify", name: "Notify (Email/In-App)", icon: Bell, color: "text-blue-500" },
  { id: "assign_task", name: "Assign Task", icon: ClipboardCheck, color: "text-purple-600" },
  { id: "audit_log", name: "Log Approval/Audit", icon: FileText, color: "text-orange-500" },
  { id: "generate_doc", name: "Generate Document", icon: FileCheck2, color: "text-teal-600" },
  { id: "update_status", name: "Update Status", icon: Workflow, color: "text-sky-600" },
  { id: "escalate", name: "Escalate After Delay", icon: Clock, color: "text-purple-500" },

  // Flow controls
  { id: "condition", name: "Condition / Branch", icon: GitBranch, color: "text-warning" },
  { id: "parallel", name: "Parallel Approvals", icon: SplitSquareHorizontal, color: "text-pink-600" },

  // Finish
  { id: "complete", name: "Mark Complete", icon: CheckCircle2, color: "text-emerald-600" },
];

export function WorkflowToolbox() {
  const handleDragStart = (e: React.DragEvent, nodeType: string, nodeName: string) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("nodeType", nodeType);
    e.dataTransfer.setData("nodeName", nodeName);
  };

  return (
    <div className="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-20rem)]">
      {nodeTypes.map((node) => (
        <div
          key={node.id}
          className="p-3 border rounded-lg cursor-move hover:bg-muted/50 transition-colors flex items-center gap-3 active:opacity-50"
          draggable
          onDragStart={(e) => handleDragStart(e, node.id, node.name)}
        >
          <node.icon className={`h-5 w-5 ${node.color}`} />
          <span className="text-sm font-medium">{node.name}</span>
        </div>
      ))}
    </div>
  );
}
