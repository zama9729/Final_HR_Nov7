import { useEffect, useState, useMemo, useRef } from "react";
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
import {
  ChevronDown,
  Mail,
  Building2,
  Users,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MoreVertical,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

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
  managerName?: string | null;
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
  managerName,
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
                className={`relative w-64 rounded-2xl bg-white shadow-[0_10px_30px_rgba(15,23,42,0.12)] border border-slate-100
                  transition-transform duration-200 ease-in-out hover:scale-[1.03] hover:shadow-[0_16px_40px_rgba(15,23,42,0.16)]
                  ${isRoot ? "ring-2 ring-blue-200/70" : ""}
                  ${isSelected ? "ring-2 ring-emerald-300/80" : ""}
                `}
              >
                <div className="flex items-start gap-3 px-4 pt-3 pb-2">
                  {/* Avatar */}
                  <div className="relative">
                    <Avatar className="h-12 w-12 border-2 border-white shadow-inner">
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
                      <AvatarFallback className="bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 text-sm font-semibold">
                        {initials || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white ${getPresenceColor(
                        node.presence_status
                      )}`}
                    />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#2E3A59]">
                          {fullName || "Unnamed"}
                        </p>
                        {node.designation_name && (
                          <p className="mt-0.5 text-[11px] font-semibold text-blue-600">
                            Grade {node.designation_name}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {department}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {designation}
                        </p>
                      </div>

                      {/* Quick menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-500 shadow-sm transition hover:bg-slate-100"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Open actions"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect?.(node);
                            }}
                          >
                            View Profile
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Email */}
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Mail className="h-3 w-3" />
                      <span className="truncate" title={email}>
                        {email}
                      </span>
                    </div>

                    {/* Presence label */}
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {getPresenceLabel(node.presence_status)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expand/Collapse */}
                {hasChildren && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(node.id);
                    }}
                    className={`flex w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/60 px-2 py-1.5 text-[11px] text-slate-600 transition hover:bg-blue-50
                      ${isExpanded ? "" : ""}
                    `}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    <ChevronDown
                      className={`h-3 w-3 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                    <span>
                      {isExpanded ? "Hide direct reports" : "Show direct reports"}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-slate-900/95 text-white border-slate-700"
          >
            <div className="space-y-1 text-xs">
              <p className="font-semibold">{fullName}</p>
              <p className="text-slate-300">{designation}</p>
              {managerName && (
                <p className="text-slate-300">
                  Reports to: <span className="font-medium">{managerName}</span>
                </p>
              )}
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
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Children Container */}
      {hasChildren && (
        <div className="mt-4 flex flex-col items-center relative">
          {/* Vertical Line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-10 bg-gradient-to-b from-slate-300 dark:from-slate-600 to-transparent" />

          {/* Expanded Children with Animation */}
          {isExpanded && (
            <div className="relative flex items-start gap-8 pt-6 animate-in fade-in slide-in-from-top-4 duration-500">
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

interface EnhancedOrgChartProps {
  searchQuery?: string;
}

export default function EnhancedOrgChart({ searchQuery = "" }: EnhancedOrgChartProps) {
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
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const selectedId = selectedNode?.id ?? null;

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerSkills, setDrawerSkills] = useState<any[]>([]);
  const [drawerProjects, setDrawerProjects] = useState<any[]>([]);
  const [drawerCerts, setDrawerCerts] = useState<any[]>([]);

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
    const run = async () => {
      try {
        await loadOrgChart();
        await loadBranches();
      } catch (error) {
        console.error("[OrgChart] Failed to load org chart:", error);
        setEmployees([]);
        setTree([]);
        setLoading(false);
      }
    };
    run();
  }, []);

  const loadOrgChart = async () => {
    try {
      const [employeesData, designationsData] = await Promise.all([
        fetchOrgStructure(),
        api.getDesignations().catch(() => [] as Designation[]),
      ]);
      setEmployees(employeesData);
      const safeDesignations = (designationsData as Designation[]) || [];
      setDesignations(safeDesignations);
      const orgTree = buildTree(employeesData, safeDesignations);
      setTree(orgTree);
    } catch (error) {
      console.error("[OrgChart] loadOrgChart error:", error);
      setEmployees([]);
      setTree([]);
    } finally {
      setLoading(false);
    }
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
    const searchTerm = searchQuery.trim().toLowerCase();
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
  }, [employees, filters, searchQuery]);

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

  // Load lightweight profile extras for drawer (skills, projects, certifications)
  useEffect(() => {
    const loadExtras = async () => {
      if (!selectedNode) {
        setDrawerSkills([]);
        setDrawerProjects([]);
        setDrawerCerts([]);
        return;
      }
      setDrawerLoading(true);
      try {
        const token = api.token || localStorage.getItem("auth_token") || "";
        const base = import.meta.env.VITE_API_URL;
        const empId = selectedNode.id;

        const [skillsResp, projectsResp, certsResp] = await Promise.all([
          fetch(`${base}/api/v1/employees/${empId}/skills`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null),
          fetch(`${base}/api/v1/employees/${empId}/projects?type=active`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null),
          fetch(`${base}/api/v1/employees/${empId}/certifications`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null),
        ]);

        if (skillsResp && skillsResp.ok) {
          const data = await skillsResp.json();
          setDrawerSkills(Array.isArray(data) ? data : []);
        } else {
          setDrawerSkills([]);
        }

        if (projectsResp && projectsResp.ok) {
          const data = await projectsResp.json();
          const list = Array.isArray(data) ? data : data?.projects || [];
          setDrawerProjects(list);
        } else {
          setDrawerProjects([]);
        }

        if (certsResp && certsResp.ok) {
          const data = await certsResp.json();
          setDrawerCerts(Array.isArray(data) ? data : []);
        } else {
          setDrawerCerts([]);
        }
      } catch (e) {
        console.error("Failed to load org chart drawer data", e);
        setDrawerSkills([]);
        setDrawerProjects([]);
        setDrawerCerts([]);
      } finally {
        setDrawerLoading(false);
      }
    };

    loadExtras();
  }, [selectedNode]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    isPanningRef.current = true;
    lastPosRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return;
    const dx = event.clientX - lastPosRef.current.x;
    const dy = event.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: event.clientX, y: event.clientY };
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
  };

  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const showReset = scale !== 1 || offset.x !== 0 || offset.y !== 0;

  return (
    <div className="w-full space-y-6">
      {/* Filters & Branch hierarchy */}
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
      <div
        className="relative w-full overflow-hidden pb-12 rounded-b-[28px] bg-[#F9FBFF]"
        style={{ minHeight: "600px" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="inline-flex flex-col items-center gap-16 p-8 min-w-max transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
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
              onSelect={(node) => setSelectedNode(node)}
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
              onSelect={(node) => setSelectedNode(node)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Zoom controls (top-left) */}
        <div className="pointer-events-auto absolute top-4 left-4 flex flex-col gap-2 rounded-full bg-white/90 p-1 shadow-md border border-slate-200">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full hover:bg-blue-50"
            onClick={() => setScale((s) => Math.min(1.8, s + 0.15))}
          >
            <ZoomIn className="h-4 w-4 text-slate-600" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full hover:bg-blue-50"
            onClick={() => setScale((s) => Math.max(0.4, s - 0.15))}
          >
            <ZoomOut className="h-4 w-4 text-slate-600" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full hover:bg-blue-50"
            onClick={resetView}
          >
            <Maximize2 className="h-4 w-4 text-slate-600" />
          </Button>
        </div>

        {/* Legend & Back to top (top-right) */}
        <div className="pointer-events-auto absolute top-4 right-4 flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] text-slate-600 shadow-md border border-slate-200">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Online
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Waiting for Onboarding
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-500" /> Offline
            </span>
          </div>
          {showReset && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full bg-white/95 text-xs shadow-sm"
              onClick={resetView}
            >
              Back to top
            </Button>
          )}
        </div>
      </div>

      {/* Right-side info drawer */}
      {selectedNode && selectedNode.profiles && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setSelectedNode(null)}>
          <div
            className="h-full w-full max-w-md bg-white shadow-2xl px-5 py-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Profile</p>
                <p className="text-lg font-semibold text-slate-900">
                  {`${selectedNode.profiles.first_name || ""} ${selectedNode.profiles.last_name || ""}`.trim() ||
                    "Employee"}
                </p>
                <p className="text-sm text-slate-500">
                  {selectedNode.position || "Employee"} ·{" "}
                  {selectedNode.home_assignment?.department_name || selectedNode.department || "Unassigned"}
                </p>
              </div>

              {/* About */}
              <div className="rounded-xl border bg-slate-50 px-3 py-2">
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">About</p>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {selectedNode.profiles.profile_picture_url ? (
                      <ProfilePicture
                        userId={selectedNode.id}
                        src={selectedNode.profiles.profile_picture_url}
                        className="h-full w-full object-cover"
                        alt=""
                      />
                    ) : (
                      <AvatarImage src={undefined} alt="" />
                    )}
                    <AvatarFallback>
                      {(selectedNode.profiles.first_name?.[0] || "") +
                        (selectedNode.profiles.last_name?.[0] || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-slate-900">{selectedNode.profiles.email}</p>
                    <p className="text-xs text-slate-500">Employee ID: {selectedNode.employee_id}</p>
                    {selectedNode.home_assignment?.branch_name && (
                      <p className="text-xs text-slate-500">
                        Branch: {selectedNode.home_assignment.branch_name}
                      </p>
                    )}
                    {selectedNode.home_assignment?.team_name && (
                      <p className="text-xs text-slate-500">
                        Team: {selectedNode.home_assignment.team_name}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Presence</span>
                  <Badge variant="outline" className="capitalize">
                    {getPresenceLabel(selectedNode.presence_status)}
                  </Badge>
                </div>
                {selectedNode.home_assignment?.branch_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Branch</span>
                    <span className="font-medium text-slate-800">
                      {selectedNode.home_assignment.branch_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Skills */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-500">Skills</span>
                  {drawerLoading && (
                    <span className="text-[11px] text-slate-400">Loading…</span>
                  )}
                </div>
                {drawerSkills.length === 0 && !drawerLoading ? (
                  <p className="text-xs text-slate-500">No skills listed yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {drawerSkills.slice(0, 6).map((s: any) => (
                      <Badge
                        key={s.id || s.name}
                        variant="secondary"
                        className="text-[11px]"
                      >
                        {s.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Projects */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-500">Projects</span>
                </div>
                {drawerProjects.length === 0 && !drawerLoading ? (
                  <p className="text-xs text-slate-500">No active projects found.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-slate-600">
                    {drawerProjects.slice(0, 4).map((p: any) => (
                      <li key={p.id || p.name}>• {p.name || p.project_name}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Certifications */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Certifications
                  </span>
                </div>
                {drawerCerts.length === 0 && !drawerLoading ? (
                  <p className="text-xs text-slate-500">No certifications recorded.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-slate-600">
                    {drawerCerts.slice(0, 4).map((c: any, idx: number) => (
                      <li key={c.id || idx}>
                        • {c.name}
                        {c.issuer ? ` · ${c.issuer}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Upcoming leaves (placeholder – can be wired to leave APIs later) */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Upcoming leaves
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  No upcoming leaves in the next 30 days.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
