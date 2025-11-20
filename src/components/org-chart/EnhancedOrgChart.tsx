import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, MapPin, Circle } from "lucide-react";
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
    case 'online': return 'text-green-500';
    case 'away': return 'text-red-500';
    case 'break': return 'text-yellow-500';
    case 'out_of_office': return 'text-blue-500';
    default: return 'text-gray-400';
  }
}

function renderNode(node: TreeNode, level: number = 0): JSX.Element {
  if (!node.profiles) return <></>;

  const initials = `${node.profiles.first_name?.[0] || ''}${node.profiles.last_name?.[0] || ''}`.toUpperCase();
  const fullName = `${node.profiles.first_name || ''} ${node.profiles.last_name || ''}`.trim();
  const hasChildren = node.children.length > 0;

  return (
    <div key={node.id} className="flex flex-col items-center">
      <Card className="w-80 hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/50 bg-gradient-to-br from-card to-card/80">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16 border-2 border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {node.presence_status && (
                <div className="absolute -bottom-1 -right-1">
                  <Circle className={`h-4 w-4 ${getPresenceColor(node.presence_status)} rounded-full border-2 border-background`} fill="currentColor" />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-lg text-foreground">{fullName}</h3>
              </div>
              {node.position && (
                <p className="text-sm font-medium text-primary mb-2">{node.position}</p>
              )}
              {node.department && (
                <Badge variant="secondary" className="mb-2">{node.department}</Badge>
              )}
              {node.home_assignment?.branch_name && (
                <Badge variant="outline" className="mb-2">{node.home_assignment.branch_name}</Badge>
              )}
              {node.home_assignment?.team_name && (
                <p className="text-xs text-muted-foreground mb-2">Team: {node.home_assignment.team_name}</p>
              )}
              
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate">{node.profiles.email}</span>
                </div>
                {node.profiles.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{node.profiles.phone}</span>
                  </div>
                )}
                {node.work_location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{node.work_location}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {hasChildren && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {node.children.length} Direct Report{node.children.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {hasChildren && (
        <div className="relative mt-8">
          {/* Vertical line from parent */}
          <div className="absolute left-1/2 top-0 h-8 w-0.5 bg-border -translate-x-1/2 -translate-y-8" />
          
          <div className="flex gap-12 relative">
            {/* Horizontal connector line */}
            {node.children.length > 1 && (
              <div 
                className="absolute top-0 h-0.5 bg-border" 
                style={{
                  left: '50%',
                  right: '50%',
                  transform: `translateX(-${(node.children.length - 1) * 6}rem) scaleX(${node.children.length - 1})`,
                  transformOrigin: 'center',
                }}
              />
            )}
            
            {node.children.map((child, index) => (
              <div key={child.id} className="relative">
                {/* Vertical line to child */}
                <div className="absolute left-1/2 top-0 h-8 w-0.5 bg-border -translate-x-1/2" />
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

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const home = emp.home_assignment;
      if (filters.branch !== "all" && home?.branch_id !== filters.branch) return false;
      if (filters.department !== "all" && home?.department_id !== filters.department)
        return false;
      if (filters.team !== "all" && home?.team_id !== filters.team) return false;
      return true;
    });
  }, [employees, filters]);

  useEffect(() => {
    const orgTree = buildTree(filteredEmployees);
    setTree(orgTree);
  }, [filteredEmployees]);

  const metrics = useMemo(() => {
    const branchCounts: Record<string, number> = {};
    filteredEmployees.forEach((emp) => {
      const label = emp.home_assignment?.branch_name || "Unassigned";
      branchCounts[label] = (branchCounts[label] || 0) + 1;
    });
    return branchCounts;
  }, [filteredEmployees]);

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

  const departmentOptions = useMemo(() => {
    if (filters.branch === "all") return [];
    return hierarchy.departments.filter((dept) => dept.branch_id === filters.branch);
  }, [hierarchy.departments, filters.branch]);

  const teamOptions = useMemo(() => {
    if (filters.branch === "all") return [];
    return hierarchy.teams.filter((team) => team.branch_id === filters.branch);
  }, [hierarchy.teams, filters.branch]);

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