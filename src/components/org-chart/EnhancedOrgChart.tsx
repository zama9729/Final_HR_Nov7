import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProfilePicture } from "@/components/ProfilePicture";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronDown, Mail, Building2, Users, Search } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  designation_id?: string | null;
  designation_name?: string | null;
  designation_level?: number | null;
  designation_parent_id?: string | null;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    profile_picture_url?: string | null;
  } | null;
  home_assignment?: Assignment | null;
  assignments?: Assignment[];
}

interface TreeNode extends Employee {
  children: TreeNode[];
}

interface Designation {
  id: string;
  name: string;
  level: number | null;
  parent_designation_id: string | null;
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

function buildTree(employees: Employee[], designations: Designation[] = []): TreeNode[] {
  const employeeMap = new Map<string, TreeNode>();
  const designationMap = new Map<string, Designation>();
  const employeesByDesignation = new Map<string, Employee[]>();

  designations.forEach(des => designationMap.set(des.id, des));
  
  employees.forEach(emp => {
    employeeMap.set(emp.id, { ...emp, children: [] });
    if (emp.designation_id) {
      const list = employeesByDesignation.get(emp.designation_id) || [];
      list.push(emp);
      employeesByDesignation.set(emp.designation_id, list);
    }
  });

  const roots: TreeNode[] = [];

  const resolveManagerId = (emp: Employee): string | null => {
    if (emp.reporting_manager_id && employeeMap.has(emp.reporting_manager_id)) {
      return emp.reporting_manager_id;
    }

    // Fallback: use designation hierarchy to infer manager based on parent designation
    let currentDesignation = emp.designation_id || null;
    const visited = new Set<string>();

    while (currentDesignation) {
      if (visited.has(currentDesignation)) break;
      visited.add(currentDesignation);

      const parentDesig = designationMap.get(currentDesignation)?.parent_designation_id || null;
      if (!parentDesig) break;

      const candidateManagers = employeesByDesignation.get(parentDesig);
      if (candidateManagers && candidateManagers.length > 0) {
        // If multiple managers exist for parent designation, pick the first one deterministically
        const sorted = [...candidateManagers].sort((a, b) => (a.employee_id || "").localeCompare(b.employee_id || ""));
        const chosen = sorted.find(c => c.id !== emp.id) || sorted[0];
        if (chosen && chosen.id !== emp.id) {
          return chosen.id;
        }
      }

      currentDesignation = parentDesig;
    }

    return null;
  };
  
  employeeMap.forEach(node => {
    const managerId = resolveManagerId(node);
    if (managerId && employeeMap.has(managerId)) {
      const parent = employeeMap.get(managerId)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function getPresenceColor(status?: string): string {
  switch (status) {
    case "online":
      return "bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)]";
    case "away":
      return "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.7)]";
    case "break":
      return "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.7)]";
    case "out_of_office":
      return "bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.7)]";
    default:
      return "bg-slate-400 shadow-[0_0_10px_rgba(148,163,184,0.6)]";
  }
}

function getPresenceLabel(status?: string): string {
  switch (status) {
    case "online":
      return "Online";
    case "away":
      return "Away";
    case "break":
      return "On Break";
    case "out_of_office":
      return "Out of Office";
    default:
      return "Offline";
  }
}

interface OrgChartNodeProps {
  node: TreeNode;
  level: number;
  isExpanded: boolean;
  onToggle: (nodeId: string) => void;
  isRoot?: boolean;
  expandedNodes: Set<string>;
   selectedId?: string | null;
   onSelect?: (node: TreeNode) => void;
}

function OrgChartNode({
  node,
  level,
  isExpanded,
  onToggle,
  isRoot = false,
  expandedNodes,
  selectedId,
  onSelect,
}: OrgChartNodeProps) {
  if (!node.profiles) return null;

  const initials = `${node.profiles.first_name?.[0] || ''}${node.profiles.last_name?.[0] || ''}`.toUpperCase();
  const fullName = `${node.profiles.first_name || ''} ${node.profiles.last_name || ''}`.trim();
  const designation = node.position || "Employee";
  const email = node.profiles.email || "";
  const hasChildren = node.children.length > 0;
  const department = node.home_assignment?.department_name || node.department || "Unassigned";
  const branch = node.home_assignment?.branch_name || node.work_location || "";
  const isSelected = selectedId === node.id;

  return (
    <div className="flex flex-col items-center relative">
      {/* Node Card */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="relative group cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(node);
              }}
            >
              <div
                className={`
                  relative w-32 h-32 rounded-full 
                  bg-gradient-to-br from-white via-white to-slate-50
                  dark:from-slate-800 dark:via-slate-800 dark:to-slate-900
                  border-2 border-slate-200/60 dark:border-slate-700/60
                  shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]
                  flex items-center justify-center
                  transition-all duration-300
                  hover:scale-105 hover:shadow-[0_12px_32px_rgba(15,23,42,0.18)] dark:hover:shadow-[0_12px_32px_rgba(0,0,0,0.4)]
                  ${isRoot ? 'ring-4 ring-blue-200/50 dark:ring-blue-800/30' : ''}
                  ${isSelected ? 'ring-4 ring-emerald-300/70 dark:ring-emerald-500/70 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900' : ''}
                `}
              >
                {/* Profile Picture */}
                <Avatar className="h-24 w-24 border-2 border-white dark:border-slate-700 shadow-inner">
                  {node.profiles?.profile_picture_url ? (
                    <ProfilePicture
                      userId={node.id}
                      src={node.profiles.profile_picture_url}
                      className="h-full w-full object-cover"
                      alt={fullName}
                    />
                  ) : (
                    <AvatarImage src={undefined} alt={fullName} />
                  )}
                  <AvatarFallback className="bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 text-blue-700 dark:text-blue-200 text-lg font-semibold">
                    {initials || "?"}
                  </AvatarFallback>
                </Avatar>

                {/* Presence Indicator */}
                <div
                  className={`
                    absolute bottom-2 right-2 h-4 w-4 rounded-full border-2 border-white dark:border-slate-800
                    ${getPresenceColor(node.presence_status)}
                  `}
                  title={getPresenceLabel(node.presence_status)}
                />
              </div>

              {/* Name and Designation */}
              <div className="mt-3 text-center space-y-1 min-w-[160px]">
                <p className="font-semibold text-sm text-slate-900 dark:text-white leading-tight">
                  {fullName || "Unnamed"}
                </p>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {designation}
                </p>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {department}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {email}
                </p>
              </div>

              {/* Expand/Collapse Arrow */}
              {hasChildren && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(node.id);
                  }}
                  className={`
                    mt-2 mx-auto w-8 h-8 rounded-full
                    bg-white/90 dark:bg-slate-800/90
                    border border-slate-200/60 dark:border-slate-700/60
                    shadow-md
                    flex items-center justify-center
                    transition-all duration-300
                    hover:bg-blue-50 dark:hover:bg-blue-900/30
                    hover:border-blue-300 dark:hover:border-blue-700
                    hover:scale-110
                    ${isExpanded ? 'rotate-180' : ''}
                  `}
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  <ChevronDown className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                </button>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-slate-900/95 dark:bg-slate-800/95 text-white border-slate-700">
            <div className="space-y-1 text-xs">
              <p className="font-semibold">{fullName}</p>
              <p className="text-slate-300">{designation}</p>
              <div className="flex items-center gap-1 text-slate-400">
                <Building2 className="h-3 w-3" />
                <span>{department}</span>
              </div>
              {branch && (
                <div className="flex items-center gap-1 text-slate-400">
                  <Users className="h-3 w-3" />
                  <span>{branch}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-slate-400">
                <Mail className="h-3 w-3" />
                <span>{email}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Children Container */}
      {hasChildren && (
        <div className="mt-6 flex flex-col items-center relative">
          {/* Vertical Line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-gradient-to-b from-slate-300 dark:from-slate-600 to-transparent" />

          {/* Expanded Children with Animation */}
          {isExpanded && (
            <div
              className="relative flex items-start gap-8 pt-6 animate-in fade-in slide-in-from-top-4 duration-500"
            >
              {/* Horizontal Connector Line */}
              {node.children.length > 1 && (
                <div
                  className="absolute top-6 left-1/2 -translate-x-1/2 h-0.5 bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent"
                  style={{
                    width: `${Math.max(0, (node.children.length - 1) * 200)}px`,
                  }}
                />
              )}

              {/* Children Nodes */}
              <div className="flex gap-8">
                {node.children.map((child, index) => (
                  <div
                    key={child.id}
                    className="flex flex-col items-center relative"
                    style={{
                      animation: `fadeInUp 0.5s ease-out ${index * 0.1}s both`,
                    }}
                  >
                    {/* Vertical Line Up to Horizontal Connector */}
                    {node.children.length > 1 && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-gradient-to-b from-transparent to-slate-300 dark:to-slate-600" />
                    )}
                    {node.children.length === 1 && (
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-gradient-to-b from-transparent to-slate-300 dark:to-slate-600" />
                    )}

                    {/* Recursive Child Node */}
                    <OrgChartNode
                      node={child}
                      level={level + 1}
                      isExpanded={expandedNodes.has(child.id)}
                      onToggle={onToggle}
                      expandedNodes={expandedNodes}
                      selectedId={selectedId}
                      onSelect={onSelect}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export default function EnhancedOrgChart() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [designations, setDesignations] = useState<Designation[]>([]);
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
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Expand all nodes by default
  useEffect(() => {
    const allNodeIds = new Set<string>();
    const collectIds = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.children.length > 0) {
          allNodeIds.add(node.id);
          collectIds(node.children);
        }
      });
    };
    collectIds(tree);
    setExpandedNodes(allNodeIds);
  }, [tree]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    loadOrgChart();
    loadBranches();
  }, []);

  const loadOrgChart = async () => {
    const [employeesData, designationsData] = await Promise.all([
      fetchOrgStructure(),
      api.getDesignations().catch(() => [] as Designation[]),
    ]);
    setEmployees(employeesData);
    const safeDesignations = (designationsData as Designation[]) || [];
    setDesignations(safeDesignations);
    const orgTree = buildTree(employeesData, safeDesignations);
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
    } catch (error: any) {
      // Silently handle permission errors - managers may not have access to branches
      if (error?.message?.includes('permission') || error?.message?.includes('403')) {
        console.log('Branch access not available for this role');
        setHierarchy({ branches: [], departments: [], teams: [] });
      } else {
        console.error("Failed to load branches", error);
      }
    }
  };

  const filteredEmployees = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return employees.filter((emp) => {
      const home = emp.home_assignment;
      if (filters.branch !== "all" && home?.branch_id !== filters.branch) return false;
      if (filters.department !== "all" && home?.department_id !== filters.department) return false;
      if (filters.team !== "all" && home?.team_id !== filters.team) return false;

      if (!searchTerm) return true;

      const fullName = `${emp.profiles?.first_name || ""} ${emp.profiles?.last_name || ""}`.toLowerCase();
      const position = (emp.position || "").toLowerCase();
      const department = (home?.department_name || emp.department || "").toLowerCase();

      return (
        fullName.includes(searchTerm) ||
        position.includes(searchTerm) ||
        department.includes(searchTerm)
      );
    });
  }, [employees, filters, search]);

  useEffect(() => {
    const orgTree = buildTree(filteredEmployees);
    setTree(orgTree);
  }, [filteredEmployees, designations]);

  const metrics = useMemo(() => {
    const branchCounts: Record<string, number> = {};
    filteredEmployees.forEach((emp) => {
      const label = emp.home_assignment?.branch_name || "Unassigned";
      branchCounts[label] = (branchCounts[label] || 0) + 1;
    });
    return branchCounts;
  }, [filteredEmployees]);

  // Find CEO (usually the root node or someone with role 'ceo')
  const ceoNode = useMemo(() => {
    // First, try to find a node with no manager (root)
    const roots = tree.filter(node => !node.reporting_manager_id);
    if (roots.length > 0) {
      // If multiple roots, prefer one with 'ceo' in position/role
      const ceo = roots.find(node => 
        node.position?.toLowerCase().includes('ceo') || 
        node.position?.toLowerCase().includes('chief')
      );
      return ceo || roots[0];
    }
    return tree[0] || null;
  }, [tree]);

  // Other root nodes (non-CEO)
  const otherRoots = useMemo(() => {
    const roots = tree.filter(node => !node.reporting_manager_id);
    return roots.filter(node => node.id !== ceoNode?.id);
  }, [tree, ceoNode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="animate-pulse text-slate-500 dark:text-slate-400">Loading organization chart...</div>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="text-center">
          <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No organizational data found</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">Add employees to see the organization structure</p>
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
    <div className="w-full space-y-6">
      {/* Filters & Search */}
      <div className="flex flex-wrap gap-4 items-end px-6 pt-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Branch</p>
          <Select
            value={filters.branch}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, branch: value, department: "all", team: "all" }))
            }
          >
            <SelectTrigger className="w-48 border-slate-200 dark:border-slate-700">
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
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Department</p>
          <Select
            value={filters.department}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, department: value, team: "all" }))
            }
            disabled={filters.branch === "all"}
          >
            <SelectTrigger className="w-48 border-slate-200 dark:border-slate-700">
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
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Team</p>
          <Select
            value={filters.team}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, team: value }))
            }
            disabled={filters.branch === "all"}
          >
            <SelectTrigger className="w-48 border-slate-200 dark:border-slate-700">
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
        <div className="flex-1 min-w-[220px] flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Search</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, role, or department"
              className="pl-9 border-slate-200 dark:border-slate-700"
            />
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="flex flex-wrap gap-4 px-6">
        {Object.entries(metrics).map(([branch, count]) => (
          <Card key={branch} className="min-w-[180px] border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <div className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{branch}</p>
              <p className="text-2xl font-semibold text-slate-900 dark:text-white">{count}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Active employees</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Org Chart Container */}
      <div className="w-full overflow-auto pb-12" style={{ minHeight: '600px' }}>
        <div className="inline-flex flex-col items-center gap-16 p-8 min-w-max">
          {/* CEO at Top Center */}
          {ceoNode && (
            <OrgChartNode
              node={ceoNode}
              level={0}
              isExpanded={expandedNodes.has(ceoNode.id)}
              onToggle={toggleNode}
              isRoot={true}
              expandedNodes={expandedNodes}
              selectedId={selectedId}
              onSelect={(node) => setSelectedId(node.id)}
            />
          )}

          {/* Other Root Nodes (if any) */}
          {otherRoots.length > 0 && (
            <div className="flex gap-12 items-start">
              {otherRoots.map((root) => (
                <OrgChartNode
                  key={root.id}
                  node={root}
                  level={0}
                  isExpanded={expandedNodes.has(root.id)}
                  onToggle={toggleNode}
                  expandedNodes={expandedNodes}
                  selectedId={selectedId}
                  onSelect={(node) => setSelectedId(node.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
