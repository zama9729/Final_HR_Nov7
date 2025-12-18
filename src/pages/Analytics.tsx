import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Download, Filter, RefreshCw, Users, CalendarDays, Briefcase, UserSquare, MapPin } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { SkillsNetworkGraph } from "@/components/analytics/SkillsNetworkGraph";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Fix for default marker icon in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Component to handle map resize
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const handleResize = () => {
      setTimeout(() => {
        map.invalidateSize();
      }, 150);
    };
    
    // Initial resize
    handleResize();
    
    // Listen for window resize
    window.addEventListener('resize', handleResize);
    
    // Use ResizeObserver to detect container size changes (e.g., sidebar toggle)
    const container = map.getContainer().parentElement;
    if (container) {
      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(container);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        resizeObserver.disconnect();
      };
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);
  return null;
}

type DistributionDatum = { name: string; value: number };

interface BranchMarker {
  id: string;
  name: string;
  city?: string;
  country?: string;
  employees?: number;
  teams?: number;
  lat: number;
  lon: number;
}

interface PositionedBranch extends BranchMarker {
  position: { left: number; top: number };
}

const SLICE_COLORS = ["#6366F1", "#A855F7", "#F472B6", "#FBBF24", "#34D399", "#38BDF8", "#F97316", "#F43F5E"];

const buildDonutTooltip =
  (total: number) =>
  ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const entry = payload[0];
    const percent = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";
    return (
      <div className="rounded-2xl border border-slate-200/50 dark:border-white/15 bg-white/95 dark:bg-[#071226]/90 px-4 py-3 text-xs text-slate-900 dark:text-slate-100 shadow-2xl backdrop-blur">
        <p className="text-sm font-semibold">{entry.name}</p>
        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
          {entry.value} people • {percent}%
        </p>
      </div>
    );
  };

const projectCoordinates = (lat: number, lon: number) => {
  const x = ((lon + 180) / 360) * 100;
  const y = ((90 - lat) / 180) * 100;
  return {
    left: Math.min(95, Math.max(5, x)),
    top: Math.min(95, Math.max(5, y)),
  };
};

export default function Analytics() {
  const [departmentData, setDepartmentData] = useState<DistributionDatum[]>([]);
  const [skillsData, setSkillsData] = useState<DistributionDatum[]>([]);
  const [skillsNetworkData, setSkillsNetworkData] = useState<any>(null);
  const [overall, setOverall] = useState<Record<string, number>>({});
  const [branches, setBranches] = useState<BranchMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [hoverBranchId, setHoverBranchId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      setLoading(true);
      await initialize();
      setLoading(false);
    })();
  }, []);

  // Force map re-render when branches are loaded
  const [mapKey, setMapKey] = useState(0);
  useEffect(() => {
    if (branches.length > 0) {
      setMapKey((prev) => prev + 1);
    }
  }, [branches.length]);

  const initialize = async () => {
    await Promise.all([loadAnalyticsData(), loadBranches(), loadSkillsNetwork()]);
  };

  const loadSkillsNetwork = async () => {
    try {
      const data = await api.getSkillsNetwork();
      setSkillsNetworkData(data);
    } catch (error) {
      console.error("Skills network error", error);
    }
  };

  const loadAnalyticsData = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/analytics`, {
        headers: { Authorization: `Bearer ${api.token || localStorage.getItem("auth_token")}` },
      });
      if (!resp.ok) throw new Error("Failed to load analytics");
      const data = await resp.json();
      
      // Parse overall stats - ensure numbers are properly converted
      const overallData = data.overall || {};
      console.log('[Analytics] Raw overall data from API:', overallData);
      const parsedOverall: Record<string, number> = {};
      for (const [key, value] of Object.entries(overallData)) {
        parsedOverall[key] = typeof value === 'string' ? Number.parseInt(value, 10) || 0 : Number(value) || 0;
      }
      console.log('[Analytics] Parsed overall data:', parsedOverall);
      setOverall(parsedOverall);

      const department = (data.departmentData || []).map((row: any) => ({
        name: row.name,
        value: Number.parseInt(String(row.value), 10) || 0,
      }));
      setDepartmentData(department);

      const skills = (data.topSkills || [])
        .slice(0, 8)
        .map((row: any) => ({ name: row.name, value: Number.parseInt(String(row.count), 10) || 0 }));
      setSkillsData(skills);
    } catch (error) {
      console.error("Analytics error", error);
    }
  };

  const loadBranches = async () => {
    try {
      const data = await api.getBranchHierarchy();
      const formatted: BranchMarker[] = (data?.branches || [])
        .map((branch: any) => {
          const metadata = branch.metadata || {};
          const geo = metadata.geofence || metadata.coordinates || {};
          const lat =
            Number.parseFloat(
              geo.lat ?? geo.latitude ?? branch.latitude ?? branch.lat ?? geo.center_lat ?? metadata.lat ?? "",
            ) ?? NaN;
          const lon =
            Number.parseFloat(
              geo.lon ?? geo.lng ?? geo.longitude ?? branch.longitude ?? branch.lon ?? geo.center_lon ?? metadata.lon ?? "",
            ) ?? NaN;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
          }
          return {
            id: branch.id || branch.branch_id || branch.name,
            name: branch.name || branch.label || "Branch",
            city: branch.city || metadata.address?.city || metadata.city,
            country: branch.country || metadata.address?.country || metadata.country,
            employees: Number(branch.employee_count) || Number(metadata.headcount) || 0,
            teams: Number(branch.team_count) || Number(metadata.team_count) || 0,
            lat,
            lon,
          };
        })
        .filter(Boolean) as BranchMarker[];

      setBranches(formatted);
      if (!selectedBranchId && formatted.length) {
        setSelectedBranchId(formatted[0].id);
      }
    } catch (error: any) {
      // Silently handle permission errors - managers may not have access to branches
      if (error?.message?.includes('permission') || error?.message?.includes('403')) {
        console.log('Branch access not available for this role');
        setBranches([]);
      } else {
        console.error("Branch hierarchy error", error);
      }
    }
  };

  const handleExport = () => {
    const snapshot = {
      generated_at: new Date().toISOString(),
      overview: overall,
      departments: departmentData,
      skills: skillsData,
      branches,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `analytics-${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export ready", description: "Analytics snapshot has been downloaded." });
  };

  const handleFilter = () =>
    toast({
      title: "Filter panel",
      description: "Advanced analytics filters are in progress. Stay tuned!",
    });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await initialize();
    setIsRefreshing(false);
    toast({ title: "Analytics refreshed", description: "Latest KPIs, charts, and locations are up to date." });
  };

  // All hooks must be called before any early returns
  const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value ?? 0);

  const departmentTotal = useMemo(
    () => departmentData.reduce((sum, item) => sum + (item.value || 0), 0),
    [departmentData],
  );
  const skillTotal = useMemo(() => skillsData.reduce((sum, item) => sum + (item.value || 0), 0), [skillsData]);

  const positionedBranches: PositionedBranch[] = useMemo(
    () => branches.map((branch) => ({ ...branch, position: projectCoordinates(branch.lat, branch.lon) })),
    [branches],
  );

  const totalEmployees = Number(overall.total_employees) || 0;
  const employeesOnLeave = Number(overall.employees_on_leave) || Number(overall.pending_leaves) || 0;
  // Use project_count (all projects) as primary, fallback to active_projects if needed
  const projectCount = Number(overall.project_count) || Number(overall.active_projects) || 0;
  // Use manager_count as primary (no fallback needed - backend always returns this)
  const managerCount = Number(overall.manager_count) || 0;
  
  console.log('[Analytics] Computed values:', { totalEmployees, employeesOnLeave, projectCount, managerCount });

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-[500px] items-center justify-center bg-slate-50 dark:bg-[#050d1b] text-slate-600 dark:text-slate-300">
          <span className="animate-pulse text-sm tracking-wide">Loading analytics intelligence…</span>
        </div>
      </AppLayout>
    );
  }

  const selectedBranch =
    positionedBranches.find((branch) => branch.id === selectedBranchId) || positionedBranches[0] || null;

  const activeTooltipBranch =
    positionedBranches.find((branch) => branch.id === (hoverBranchId || selectedBranch?.id)) || null;

  const summaryHighlights = [
    {
      label: "Total teams",
      value: formatNumber(Number(overall.total_teams) || branches.reduce((acc, branch) => acc + (branch.teams ?? 0), 0)),
    },
    { label: "Active projects", value: formatNumber(projectCount) },
    { label: "Office locations", value: formatNumber(positionedBranches.length) },
  ];
  
  console.log('[Analytics] Summary highlights:', summaryHighlights);

  const kpiCards = [
    {
      id: "employees",
      label: "Total Employees",
      value: formatNumber(totalEmployees),
      subtitle: "Across all locations",
      icon: Users,
      orb: "from-indigo-400 via-indigo-500 to-indigo-700",
      glow: "shadow-[0_20px_60px_rgba(99,102,241,0.45)]",
    },
    {
      id: "leave",
      label: "Employees on Leave",
      value: formatNumber(employeesOnLeave),
      subtitle: "Today’s out-of-office",
      icon: CalendarDays,
      orb: "from-amber-300 via-amber-400 to-orange-500",
      glow: "shadow-[0_20px_60px_rgba(251,191,36,0.45)]",
    },
    {
      id: "projects",
      label: "Project Count",
      value: formatNumber(projectCount),
      subtitle: "Active initiatives",
      icon: Briefcase,
      orb: "from-emerald-300 via-emerald-400 to-teal-500",
      glow: "shadow-[0_20px_60px_rgba(16,185,129,0.45)]",
    },
    {
      id: "managers",
      label: "Manager Count",
      value: formatNumber(managerCount),
      subtitle: "People leaders",
      icon: UserSquare,
      orb: "from-fuchsia-400 via-purple-500 to-indigo-500",
      glow: "shadow-[0_20px_60px_rgba(168,85,247,0.45)]",
    },
  ];

  const quickActions = [
    { id: "export", icon: Download, label: "Export", action: handleExport },
    { id: "filter", icon: Filter, label: "Filter", action: handleFilter },
    { id: "refresh", icon: RefreshCw, label: "Refresh", action: handleRefresh, loading: isRefreshing },
  ];

  return (
    <AppLayout>
      <div className="min-h-[calc(100vh-4rem)] space-y-8 bg-gradient-to-b from-slate-50 via-blue-50/30 to-slate-100 dark:from-[#050d1a] dark:via-[#0b1f33] dark:to-[#071425] px-3 py-6 text-slate-900 dark:text-slate-100 sm:px-6 lg:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Executive analytics</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-900 dark:text-white">Intelligence & Insights</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Real-time visibility across people, skills, locations, and capacity.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {quickActions.map(({ id, icon: Icon, label, action, loading: loadingAction }) => (
              <Button
                key={id}
                className="min-w-[110px]"
                onClick={action}
                disabled={loadingAction}
              >
                <Icon className={`mr-2 h-4 w-4 ${loadingAction ? "animate-spin" : ""}`} />
                {label}
              </Button>
            ))}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map(({ id, label, value, subtitle, icon: Icon, orb, glow }) => (
            <div
              key={id}
              className={`relative overflow-hidden rounded-[18px] border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-white/10 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-400/60 dark:hover:border-blue-300/40 hover:bg-white dark:hover:bg-white/20 hover:shadow-[0_25px_70px_rgba(59,130,246,0.25)] dark:hover:shadow-[0_25px_70px_rgba(2,8,20,0.6)] ${glow}`}
            >
              <div
                className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br ${orb} opacity-40 dark:opacity-60 blur-3xl`}
                aria-hidden
              />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-300">{label}</p>
                  <p className="mt-3 text-[42px] font-semibold leading-tight text-slate-900 dark:text-white">{value}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{subtitle}</p>
                </div>
                <div className="rounded-2xl bg-blue-50/80 dark:bg-white/20 p-3 text-blue-600 dark:text-white shadow-inner">
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[26px] border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-white/5 p-6 backdrop-blur-xl shadow-[0_25px_70px_rgba(15,23,42,0.15)] dark:shadow-[0_25px_70px_rgba(2,8,20,0.45)] flex flex-col h-full">
            <div className="flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Departments</p>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Distribution by department</h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">Team mix & presence ({departmentTotal} employees)</p>
              </div>
            </div>
            <div className="mt-4 flex-1 min-h-0">
              <div className="h-full min-h-[320px]">
              {departmentData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">No data available</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={departmentData}
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={4}
                    >
                      {departmentData.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                          stroke={SLICE_COLORS[index % SLICE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={buildDonutTooltip(departmentTotal)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 text-sm text-slate-700 dark:text-slate-200 lg:grid-cols-3 flex-shrink-0">
              {departmentData.slice(0, 6).map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between rounded-2xl bg-slate-50/80 dark:bg-white/5 p-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length] }}
                    />
                    <span>{entry.name}</span>
                  </div>
                  <span className="font-semibold">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-white/5 p-6 backdrop-blur-xl shadow-[0_25px_70px_rgba(15,23,42,0.15)] dark:shadow-[0_25px_70px_rgba(2,8,20,0.45)] flex flex-col h-full">
            <div className="flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Skills</p>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Skills Network Map</h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Interactive visualization of skills and employee connections
                  {skillsNetworkData?.stats && (
                    <> • {skillsNetworkData.stats.totalSkills} skills • {skillsNetworkData.stats.totalEmployees} employees</>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-4 flex-1 min-h-0 flex flex-col">
              {!skillsNetworkData || skillsNetworkData.nodes.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  {loading ? "Loading skills network..." : "No skills data available"}
                </div>
              ) : (
                <Tabs defaultValue="network" className="w-full h-full flex flex-col">
                  <TabsList className="mb-4 flex-shrink-0">
                    <TabsTrigger value="network">Network Graph</TabsTrigger>
                    <TabsTrigger value="list">List View</TabsTrigger>
                  </TabsList>
                  <div className="flex-1 min-h-0">
                    <TabsContent value="network" className="mt-0 h-full">
                      <div className="w-full h-full overflow-hidden rounded-lg">
                        <SkillsNetworkGraph 
                          data={skillsNetworkData} 
                          width={800} 
                          height={500}
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="list" className="mt-0 h-full">
                      <div className="grid gap-2 text-sm text-slate-700 dark:text-slate-200 h-full overflow-y-auto">
                        {skillsData.slice(0, 10).map((skill, index) => (
                          <div key={skill.name} className="flex items-center justify-between rounded-2xl bg-slate-50/80 dark:bg-white/5 px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: SLICE_COLORS[(index + 3) % SLICE_COLORS.length] }}
                              />
                              <span>{skill.name}</span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{skill.value}</span>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-white/5 p-6 shadow-[0_35px_90px_rgba(15,23,42,0.2)] dark:shadow-[0_35px_90px_rgba(2,8,20,0.55)] backdrop-blur-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Global presence</p>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Office footprint</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {formatNumber(overall.total_teams ?? 0)} teams across {formatNumber(positionedBranches.length)} locations
              </p>
            </div>
            {selectedBranch && (
              <div className="rounded-2xl border border-slate-200/60 dark:border-white/10 bg-slate-50/80 dark:bg-white/10 px-5 py-4 text-sm text-slate-900 dark:text-slate-100">
                <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Selected branch</p>
                <p className="mt-1 text-lg font-semibold">{selectedBranch.name}</p>
                <p className="text-slate-600 dark:text-slate-300">
                  {selectedBranch.city || "—"} {selectedBranch.country ? `• ${selectedBranch.country}` : ""}
                </p>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {formatNumber(selectedBranch.employees || 0)} employees • {formatNumber(selectedBranch.teams || 0)} teams
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 h-[360px] w-full overflow-hidden rounded-[26px] border border-slate-200/60 dark:border-white/10 relative" style={{ backgroundColor: 'transparent' }}>
            {positionedBranches.length > 0 ? (
              <div className="h-full w-full relative" style={{ zIndex: 1, minHeight: "360px", backgroundColor: 'transparent' }}>
                <MapContainer
                  key={mapKey}
                  center={[
                    positionedBranches.reduce((sum, b) => sum + b.lat, 0) / positionedBranches.length,
                    positionedBranches.reduce((sum, b) => sum + b.lon, 0) / positionedBranches.length,
                  ]}
                  zoom={positionedBranches.length === 1 ? 10 : 3}
                  style={{ height: "100%", width: "100%", position: "relative", minHeight: "360px", backgroundColor: 'transparent' }}
                  className="rounded-[26px] [&_.leaflet-container]:!bg-transparent"
                  scrollWheelZoom={true}
                >
                  <MapResizeHandler />
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {positionedBranches.map((branch) => (
                    <Marker
                      key={branch.id}
                      position={[branch.lat, branch.lon]}
                      eventHandlers={{
                        mouseover: () => setHoverBranchId(branch.id),
                        mouseout: () => setHoverBranchId(null),
                        click: () => setSelectedBranchId(branch.id),
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-semibold text-slate-900 dark:text-white">{branch.name}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {branch.city || "—"} {branch.country ? `• ${branch.country}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                            {formatNumber(branch.employees || 0)} employees • {formatNumber(branch.teams || 0)} teams
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                No branch locations available
              </div>
            )}
          </div>
        </section>

        <footer className="rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-white/5 px-6 py-5 text-sm text-slate-700 dark:text-slate-200 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Executive summary</p>
            <div className="flex flex-col gap-4 text-base font-semibold text-slate-900 dark:text-white sm:flex-row sm:gap-10">
              {summaryHighlights.map((item) => (
                <div key={item.label} className="flex flex-col">
                  <span className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">{item.label}</span>
                  <span className="text-lg">{item.value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Updated {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })} at{" "}
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </footer>
      </div>
    </AppLayout>
  );
}
