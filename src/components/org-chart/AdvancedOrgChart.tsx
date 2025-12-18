import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  Mail,
  MoreVertical,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface Employee {
  id: string;
  employee_id: string;
  position: string | null;
  department: string | null;
  work_location: string | null;
  presence_status?: string;
  reporting_manager_id: string | null;
  designation_name?: string | null;
  join_date?: string | null;
  about_me?: string | null;
  job_love?: string | null;
  hobbies?: string | null;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
  home_assignment?: {
    department_name?: string | null;
    role?: string | null;
  } | null;
}

interface TreeNode extends Employee {
  children: TreeNode[];
}

function getPresenceLabel(status?: string): string {
  switch (status) {
    case "online":
      return "Online";
    case "waiting_for_onboarding":
      return "Waiting for onboarding";
    case "away":
      return "Away";
    default:
      return "Offline";
  }
}

function getPresenceColor(status?: string): string {
  switch (status) {
    case "online":
      return "bg-green-500";
    case "waiting_for_onboarding":
      return "bg-amber-500";
    default:
      return "bg-slate-400";
  }
}

interface AdvancedOrgChartProps {
  searchQuery?: string;
}

export default function AdvancedOrgChart({ searchQuery = "" }: AdvancedOrgChartProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<TreeNode | null>(null);

  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerSkills, setDrawerSkills] = useState<any[]>([]);
  const [drawerProjects, setDrawerProjects] = useState<any[]>([]);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getOrgStructure();
        const list = (data || []).filter((e: Employee) => e.profiles) as Employee[];
        setEmployees(list);
      } catch (error) {
        console.error("[AdvancedOrgChart] Failed to load org structure:", error);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Load lightweight "about", skills and projects when a node is selected
  useEffect(() => {
    const loadExtras = async () => {
      if (!selected) {
        setDrawerSkills([]);
        setDrawerProjects([]);
        return;
      }
      setDrawerLoading(true);
      try {
        const base = import.meta.env.VITE_API_URL;
        const token = api.token || localStorage.getItem("auth_token") || "";
        const empId = selected.id;

        const [skillsResp, projectsResp] = await Promise.all([
          fetch(`${base}/api/v1/employees/${empId}/skills`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null),
          fetch(`${base}/api/v1/employees/${empId}/projects?type=active`, {
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
      } catch (error) {
        console.error("[AdvancedOrgChart] Failed to load drawer data:", error);
        setDrawerSkills([]);
        setDrawerProjects([]);
      } finally {
        setDrawerLoading(false);
      }
    };

    loadExtras();
  }, [selected]);

  const filteredEmployees = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return employees;

    return employees.filter((e) => {
      const fullName = `${e.profiles?.first_name || ""} ${e.profiles?.last_name || ""}`.toLowerCase();
      const email = (e.profiles?.email || "").toLowerCase();
      const dept = (e.home_assignment?.department_name || e.department || "").toLowerCase();
      const pos = (e.position || "").toLowerCase();
      return (
        fullName.includes(term) ||
        email.includes(term) ||
        dept.includes(term) ||
        pos.includes(term)
      );
    });
  }, [employees, searchQuery]);

  // Map employee id -> manager full name for tooltip
  const managerNameById = useMemo(() => {
    const map = new Map<string, string>();
    const byId = new Map<string, Employee>();
    employees.forEach((e) => byId.set(e.id, e));
    employees.forEach((e) => {
      if (e.reporting_manager_id && byId.has(e.reporting_manager_id)) {
        const m = byId.get(e.reporting_manager_id)!;
        const fn = `${m.profiles?.first_name || ""} ${m.profiles?.last_name || ""}`.trim();
        map.set(e.id, fn || "Manager");
      }
    });
    return map;
  }, [employees]);

  useEffect(() => {
    if (employees.length === 0) {
      setTree([]);
      return;
    }

    const map = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    filteredEmployees.forEach((emp) => {
      map.set(emp.id, { ...emp, children: [] });
    });

    filteredEmployees.forEach((emp) => {
      const node = map.get(emp.id)!;
      if (emp.reporting_manager_id && map.has(emp.reporting_manager_id)) {
        const parent = map.get(emp.reporting_manager_id)!;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    setTree(roots);

    // expand all managers by default
    const allExpanded = new Set<string>();
    const walk = (nodes: TreeNode[]) => {
      nodes.forEach((n) => {
        if (n.children.length > 0) {
          allExpanded.add(n.id);
          walk(n.children);
        }
      });
    };
    walk(roots);
    setExpanded(allExpanded);
  }, [filteredEmployees, employees.length]);

  const handleToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const renderNode = (node: TreeNode) => {
    const fullName = `${node.profiles?.first_name || ""} ${node.profiles?.last_name || ""}`.trim();
    const initials = `${node.profiles?.first_name?.[0] || ""}${node.profiles?.last_name?.[0] || ""}`.toUpperCase() || "?";
    const grade = node.position || "-";
    const dept = node.home_assignment?.department_name || node.department || "—";
    const role = node.home_assignment?.role || "employee";
    const email = node.profiles?.email || "";
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id} className="flex flex-col items-center">
        <TooltipProvider>
          <Tooltip>
              <TooltipTrigger asChild>
              <Card
                data-id={node.id} data-manager={node.reporting_manager_id || ""} className="card-node w-64 rounded-2xl border border-slate-200 bg-white shadow-sm transition-transform duration-200 ease-in-out hover:scale-[1.03] hover:shadow-lg cursor-pointer"
                onClick={() => setSelected(node)}
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${getPresenceColor(
                            node.presence_status
                          )}`}
                        />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[15px] font-semibold text-[#2E3A59] truncate">
                          {fullName || "Employee"}
                        </p>
                        <p className="text-xs font-medium text-blue-600">{grade}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {dept} · {role}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-500 shadow-sm hover:bg-slate-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(node);
                          }}
                        >
                          View Profile
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{email}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span
                      className={`inline-flex h-2 w-2 rounded-full ${getPresenceColor(
                        node.presence_status
                      )}`}
                    />
                    <span>{getPresenceLabel(node.presence_status)}</span>
                  </div>
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle(node.id);
                      }}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:bg-blue-50"
                    >
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                      <span>{isExpanded ? "Hide direct reports" : "Show direct reports"}</span>
                    </button>
                  )}
                </div>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs font-semibold">{fullName}</p>
              <p className="text-[11px] text-slate-400">
                Reports to:{" "}
                {node.reporting_manager_id
                  ? managerNameById.get(node.id) || "Manager"
                  : "—"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {hasChildren && isExpanded && (
          <div className="mt-4 flex flex-col items-center">
            {/* 1) single vertical line from parent card downward */}
            <div className="relative h-6 w-px">
              <div className="absolute inset-0 bg-slate-400" />
            </div>

            {/* 2) horizontal connector across this parent's direct children,
                stops at the center of first/last child.
                3) vertical connectors from that line into each child */}
            <div className="relative flex items-start justify-center gap-8 w-full">
              {node.children.length > 1 && (
                <div
                  className="absolute top-0 h-px bg-slate-400"
                  style={{
                    left: "50%",
                    transform: "translateX(-50%)",
                    // distance from first child center to last child center:
                    // (n - 1) * (card width 16rem + gap 2rem)
                    width: `${(node.children.length - 1) * 18}rem`,
                  }}
                />
              )}

              {node.children.map((child) => (
                <div key={child.id} className="flex flex-col items-center relative">
                  <div className="relative h-6 w-px">
                    <div className="absolute inset-0 bg-slate-400" />
                  </div>
                  {renderNode(child)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  
  useEffect(() => {
    const svg = svgRef.current;
    const container = chartRef.current;
    if (!svg || !container) return;

    const drawConnectors = () => {
      const cards = container.querySelectorAll<HTMLElement>(".card-node");
      const rects = new Map<string, DOMRect>();
      cards.forEach((c) => rects.set(c.dataset.id!, c.getBoundingClientRect()));

      const box = container.getBoundingClientRect();
      const paths: string[] = [];

      cards.forEach((c) => {
        const parentId = c.dataset.manager;
        if (!parentId || !rects.has(parentId)) return;
        const parent = rects.get(parentId)!;
        const child = rects.get(c.dataset.id!)!;
        const x1 = parent.left + parent.width / 2 - box.left;
        const y1 = parent.bottom - box.top;
        const x2 = child.left + child.width / 2 - box.left;
        const y2 = child.top - box.top;
        const midY = y1 + (y2 - y1) / 2.2;
        paths.push(`M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`);
      });

      svg.innerHTML = `
        <defs>
          <radialGradient id="glow" r="0.5">
            <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
            <stop offset="100%" stop-color="#ccc" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <g stroke="#999" stroke-width="1.2" fill="none" stroke-linecap="round">
          ${paths.map((d) => `<path d="${d}" />`).join("")}
          ${paths.map((d) => `
            <path d="${d}" stroke="url(#glow)" stroke-width="2" stroke-dasharray="8 8">
              <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="5s" repeatCount="indefinite" />
            </path>`).join("")}
        </g>`;
    };

    drawConnectors();
    const ro = new ResizeObserver(drawConnectors);
    ro.observe(container);
    window.addEventListener("resize", drawConnectors);
    return () => {
      window.removeEventListener("resize", drawConnectors);
      ro.disconnect();
    };
  }, [tree, expanded, scale, offset]);


  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-slate-500">
        Loading organization chart…
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-slate-500">
        No organization data found.
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden bg-[#F9FBFF] pb-10"
      style={{ minHeight: "600px" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        ref={chartRef} className="inline-flex min-w-max flex-col items-center gap-10 p-8 transition-transform duration-75 ease-out"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {tree.map((node) => renderNode(node))}
      </div>

      {/* zoom controls */}
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
          onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
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

      {/* legend */}
      <div className="pointer-events-auto absolute top-4 right-4 rounded-full bg-white/95 px-3 py-1.5 text-[11px] text-slate-600 shadow-md border border-slate-200 flex items-center gap-3">
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

      {/* right side drawer (lightweight) */}
      {selected && (
        <div
          className="fixed inset-x-0 top-16 bottom-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="h-full w-full max-w-md bg-white/80 backdrop-blur-xl border border-white/40 shadow-[0_18px_40px_rgba(15,23,42,0.35)] px-5 py-6 overflow-y-auto rounded-l-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Profile
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {`${selected.profiles?.first_name || ""} ${selected.profiles?.last_name || ""}`.trim() ||
                    "Employee"}
                </p>
                <p className="text-sm text-slate-500">
                  {selected.position || "Employee"} ·{" "}
                  {selected.home_assignment?.department_name ||
                    selected.department ||
                    "Unassigned"}
                </p>
              </div>

              <div className="rounded-xl border bg-slate-50 px-3 py-2">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Contact</p>
                <p className="text-sm font-medium text-slate-900">
                  {selected.profiles?.email}
                </p>
                <p className="text-xs text-slate-500">
                  Employee ID: {selected.employee_id}
                </p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Presence</span>
                  <Badge variant="outline" className="capitalize">
                    {getPresenceLabel(selected.presence_status)}
                  </Badge>
                </div>
              </div>

              {/* About section */}
              {(selected.about_me || selected.job_love || selected.hobbies) && (
                <div className="space-y-2 text-sm">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    About
                  </p>
                  {selected.about_me && (
                    <p className="text-slate-700 text-sm">{selected.about_me}</p>
                  )}
                  {selected.job_love && (
                    <p className="text-xs text-slate-500">
                      Loves: {selected.job_love}
                    </p>
                  )}
                  {selected.hobbies && (
                    <p className="text-xs text-slate-500">
                      Hobbies: {selected.hobbies}
                    </p>
                  )}
                </div>
              )}

              {/* Skills */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Skills
                  </span>
                  {drawerLoading && (
                    <span className="text-[11px] text-slate-400">Loading…</span>
                  )}
                </div>
                {drawerSkills.length === 0 && !drawerLoading ? (
                  <p className="text-xs text-slate-500">
                    No skills listed yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {drawerSkills.slice(0, 8).map((s: any) => (
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
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Projects
                  </span>
                </div>
                {drawerProjects.length === 0 && !drawerLoading ? (
                  <p className="text-xs text-slate-500">
                    No active projects found.
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs text-slate-600">
                    {drawerProjects.slice(0, 6).map((p: any) => (
                      <li key={p.id || p.name}>• {p.name || p.project_name}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


