import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Assignment {
  assignment_id: string;
  branch_id: string | null;
  branch_name: string | null;
  department_id: string | null;
  department_name: string | null;
  team_id: string | null;
  team_name: string | null;
  is_home: boolean;
  fte: number;
  role: string | null;
}

interface Employee {
  id: string;
  employee_id: string;
  user_id: string;
  position: string | null;
  department: string | null;
  work_location: string | null;
  presence_status?: string;
  reporting_manager_id: string | null;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
  } | null;
  home_assignment?: Assignment | null;
  assignments?: Assignment[];
}

interface TreeNode extends Employee {
  children: TreeNode[];
}

async function fetchOrgStructure(): Promise<Employee[]> {
  try {
    const data = await api.getOrgStructure();
    return (data || []).filter((emp: any) => emp.profiles);
  } catch (error) {
    console.error("Error fetching org structure:", error);
    return [];
  }
}

function buildTree(employees: Employee[]): TreeNode[] {
  const employeeMap = new Map<string, TreeNode>();
  
  employees.forEach(emp => {
    employeeMap.set(emp.id, { ...emp, children: [] });
  });

  const roots: TreeNode[] = [];
  
  employeeMap.forEach(node => {
    if (node.reporting_manager_id && employeeMap.has(node.reporting_manager_id)) {
      const parent = employeeMap.get(node.reporting_manager_id)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function getPresenceColor(status?: string) {
  switch (status) {
    case "online":
      return "bg-green-500";
    case "away":
      return "bg-red-500";
    case "break":
      return "bg-yellow-500";
    case "out_of_office":
      return "bg-blue-500";
    default:
      return "bg-gray-300";
  }
}

function renderNode(node: TreeNode, level: number = 0): JSX.Element {
  if (!node.profiles) return <></>;

  const initials = `${node.profiles.first_name?.[0] || ''}${node.profiles.last_name?.[0] || ''}`.toUpperCase();
  const fullName = `${node.profiles.first_name || ''} ${node.profiles.last_name || ''}`.trim();
  const hasChildren = node.children.length > 0;

  return (
    <div key={node.id} className="flex flex-col items-center">
      <Card className="w-44 rounded-2xl border border-border/60 bg-background/70 shadow-sm">
        <CardContent className="p-4 flex flex-col items-center gap-3">
          <div className="relative">
            <Avatar className="h-14 w-14 border border-border">
              <AvatarFallback className="bg-muted text-primary text-base font-semibold">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
            <span
              className={`absolute -bottom-1 right-0 h-3.5 w-3.5 rounded-full border border-background ${getPresenceColor(
                node.presence_status
              )}`}
            />
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-sm text-foreground truncate">{fullName || "Unnamed"}</p>
            {node.position && (
              <p className="text-xs text-muted-foreground font-medium truncate">{node.position}</p>
            )}
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {node.department || "Unassigned"}
            </p>
          </div>
        </CardContent>
      </Card>

      {hasChildren && (
        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="h-6 w-px bg-border" />
          <div className="relative flex items-start gap-6">
            <div className="absolute left-0 right-0 top-3 h-px bg-border" />
            {node.children.map((child) => (
              <div key={child.id} className="flex flex-col items-center pt-3">
                <div className="h-6 w-px bg-border" />
                {renderNode(child, level + 1)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EnhancedOrgChart() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [hierarchy, setHierarchy] = useState<{ branches: any[]; departments: any[]; teams: any[] }>({
    branches: [],
    departments: [],
    teams: [],
  });
  const [filters, setFilters] = useState({
    branch: "all",
    department: "all",
    team: "all",
  });

  useEffect(() => {
    loadOrgChart();
    loadBranches();
  }, []);

  const loadOrgChart = async () => {
    const employees = await fetchOrgStructure();
    setEmployees(employees);
    const orgTree = buildTree(employees);
    setTree(orgTree);
    setLoading(false);
  };

  const loadBranches = async () => {
    try {
      const data = await api.getBranchHierarchy();
      setHierarchy({
        branches: data?.branches || [],
        departments: data?.departments || [],
        teams: data?.teams || [],
      });
    } catch (error) {
      console.error("Failed to load branches", error);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const home = emp.home_assignment;
    if (filters.branch !== "all" && home?.branch_id !== filters.branch) return false;
    if (filters.department !== "all" && home?.department_id !== filters.department) return false;
    if (filters.team !== "all" && home?.team_id !== filters.team) return false;
    return true;
  });

  useEffect(() => {
    const orgTree = buildTree(filteredEmployees);
    setTree(orgTree);
  }, [filteredEmployees]);

  const metrics = (() => {
    const branchCounts: Record<string, number> = {};
    filteredEmployees.forEach((emp) => {
      const label = emp.home_assignment?.branch_name || "Unassigned";
      branchCounts[label] = (branchCounts[label] || 0) + 1;
    });
    return branchCounts;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-pulse text-muted-foreground">Loading organization chart...</div>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <p className="text-lg font-medium text-muted-foreground">No organizational data found</p>
          <p className="text-sm text-muted-foreground mt-2">Add employees to see the organization structure</p>
        </div>
      </div>
    );
  }

  const departmentOptions =
    filters.branch === "all"
      ? []
      : hierarchy.departments.filter((dept) => dept.branch_id === filters.branch);

  const teamOptions =
    filters.branch === "all"
      ? []
      : hierarchy.teams.filter((team) => team.branch_id === filters.branch);

  return (
    <div className="w-full overflow-auto pb-12 space-y-6">
      <div className="flex flex-wrap gap-4 items-end px-6 pt-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase text-muted-foreground">Branch</p>
          <Select
            value={filters.branch}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, branch: value, department: "all", team: "all" }))
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {hierarchy.branches.map((branch: any) => (
                <SelectItem value={branch.id} key={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase text-muted-foreground">Department</p>
          <Select
            value={filters.department}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, department: value, team: "all" }))
            }
            disabled={filters.branch === "all"}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departmentOptions?.map((dept: any) => (
                <SelectItem value={dept.id} key={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase text-muted-foreground">Team</p>
          <Select
            value={filters.team}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, team: value }))
            }
            disabled={filters.branch === "all"}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {teamOptions?.map((team: any) => (
                <SelectItem value={team.id} key={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 px-6">
        {Object.entries(metrics).map(([branch, count]) => (
          <Card key={branch} className="min-w-[180px]">
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">{branch}</p>
              <p className="text-2xl font-semibold">{count}</p>
              <p className="text-xs text-muted-foreground">Active employees</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="inline-flex flex-col items-center gap-12 p-8 min-w-max">
        {tree.map((root) => renderNode(root))}
      </div>
    </div>
  );
}