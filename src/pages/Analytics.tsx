import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Users, Briefcase, Calendar, TrendingUp, CheckCircle, Clock, XCircle, BarChart3, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Modern color palette inspired by ADP
const COLORS = [
  "#6366f1", // Indigo
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f59e0b", // Amber
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#ef4444", // Red
];

const DONUT_COLORS = [
  { fill: "#6366f1", stroke: "#4f46e5" },
  { fill: "#8b5cf6", stroke: "#7c3aed" },
  { fill: "#ec4899", stroke: "#db2777" },
  { fill: "#f59e0b", stroke: "#d97706" },
  { fill: "#10b981", stroke: "#059669" },
  { fill: "#06b6d4", stroke: "#0891b2" },
  { fill: "#3b82f6", stroke: "#2563eb" },
  { fill: "#ef4444", stroke: "#dc2626" },
];

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3">
        <p className="font-semibold mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-medium">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Custom label for donut chart
const renderLabel = (entry: any, total: number) => {
  const percent = total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0;
  if (parseFloat(percent) < 5) return ""; // Don't show label for small slices
  return `${percent}%`;
};

export default function Analytics() {
  const [employeeGrowth, setEmployeeGrowth] = useState<Array<{ month: string; count: number }>>([]);
  const [departmentData, setDepartmentData] = useState<Array<{ name: string; value: number }>>([]);
  const [leaveData, setLeaveData] = useState<Array<{ month: string; approved: number; pending: number; rejected: number }>>([]);
  const [attendanceData, setAttendanceData] = useState<Array<{ month: string; avg_hours: number; active_employees: number }>>([]);
  const [projectUtilization, setProjectUtilization] = useState<Array<any>>([]);
  const [topSkills, setTopSkills] = useState<Array<any>>([]);
  const [overall, setOverall] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/analytics`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
      );
      
      if (!resp.ok) {
        throw new Error('Failed to fetch analytics');
      }
      
      const data = await resp.json();
      
      setEmployeeGrowth((data.employeeGrowth || []).map((row: any) => ({ month: row.month, count: parseInt(row.count) || 0 })));
      setDepartmentData((data.departmentData || []).map((row: any) => ({ name: row.name, value: parseInt(row.value) || 0 })));
      setLeaveData((data.leaveData || []).map((row: any) => ({
        month: row.month,
        approved: parseInt(row.approved) || 0,
        pending: parseInt(row.pending) || 0,
        rejected: parseInt(row.rejected) || 0
      })));
      setAttendanceData((data.attendanceData || []).map((row: any) => ({
        month: row.month,
        avg_hours: parseFloat(row.avg_hours) || 0,
        active_employees: parseInt(row.active_employees) || 0
      })));
      setProjectUtilization(data.projectUtilization || []);
      setTopSkills((data.topSkills || []).map((row: any) => ({
        name: row.name,
        count: parseInt(row.count) || 0,
        avg_level: parseFloat(row.avg_level) || 0
      })));
      setOverall(data.overall || {});
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-muted-foreground">Loading analytics...</div>
        </div>
      </AppLayout>
    );
  }

  const totalEmployees = overall.total_employees || 0;
  const activeProjects = overall.active_projects || 0;
  const pendingLeaves = overall.pending_leaves || 0;
  const activeAssignments = overall.active_assignments || 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
            <p className="text-muted-foreground mt-1">Comprehensive insights and trends across your organization</p>
          </div>
        </div>

        {/* Overall Stats - Modern Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-indigo-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
                <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/20 flex items-center justify-center">
                  <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalEmployees}</div>
              <p className="text-xs text-muted-foreground mt-1">Active team members</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
                <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                  <Briefcase className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{activeProjects}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently in progress</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Leaves</CardTitle>
                <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{pendingLeaves}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Assignments</CardTitle>
                <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{activeAssignments}</div>
              <p className="text-xs text-muted-foreground mt-1">Resource allocations</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="leaves">Leaves</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-indigo-600" />
                    Employee Growth (Last 6 Months)
                  </CardTitle>
                  <CardDescription>New hires over time</CardDescription>
                </CardHeader>
                <CardContent>
                  {employeeGrowth.length === 0 ? (
                    <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                      <p>No data available</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={employeeGrowth}>
                        <defs>
                          <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip content={<CustomTooltip />} />
                        <Area 
                          type="monotone" 
                          dataKey="count" 
                          stroke="#6366f1" 
                          strokeWidth={2}
                          fill="url(#colorGrowth)"
                          name="New Employees"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-purple-600" />
                    Department Distribution
                  </CardTitle>
                  <CardDescription>Employee distribution across departments</CardDescription>
                </CardHeader>
                <CardContent>
                  {departmentData.length === 0 ? (
                    <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                      <p>No data available</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={departmentData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            label={(entry) => {
                              const total = departmentData.reduce((sum, item) => sum + item.value, 0);
                              return renderLabel(entry, total);
                            }}
                          >
                            {departmentData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length].fill} stroke={DONUT_COLORS[index % DONUT_COLORS.length].stroke} strokeWidth={2} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        {departmentData.slice(0, 4).map((entry, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length].fill }} />
                            <span className="text-muted-foreground">{entry.name}</span>
                            <span className="font-semibold ml-auto">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-cyan-600" />
                  Attendance Trends
                </CardTitle>
                <CardDescription>Average hours and active employees over time</CardDescription>
              </CardHeader>
              <CardContent>
                {attendanceData.length === 0 ? (
                  <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                    <p>No data available</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={450}>
                    <LineChart data={attendanceData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis yAxisId="left" className="text-xs" />
                      <YAxis yAxisId="right" orientation="right" className="text-xs" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="avg_hours" 
                        stroke="#06b6d4" 
                        strokeWidth={3}
                        name="Avg Hours"
                        dot={{ fill: "#06b6d4", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="active_employees" 
                        stroke="#10b981" 
                        strokeWidth={3}
                        name="Active Employees"
                        dot={{ fill: "#10b981", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leaves" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-emerald-600" />
                  Leave Requests Trend
                </CardTitle>
                <CardDescription>Approved, pending, and rejected leave requests over time</CardDescription>
              </CardHeader>
              <CardContent>
                {leaveData.length === 0 ? (
                  <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                    <p>No data available</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={450}>
                    <BarChart data={leaveData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="approved" stackId="a" fill="#10b981" name="Approved" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="rejected" stackId="a" fill="#ef4444" name="Rejected" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="departments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600" />
                  Department Distribution
                </CardTitle>
                <CardDescription>Visual breakdown of employees by department</CardDescription>
              </CardHeader>
              <CardContent>
                {departmentData.length === 0 ? (
                  <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                    <p>No data available</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <ResponsiveContainer width="100%" height={400}>
                      <PieChart>
                        <Pie
                          data={departmentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={140}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {departmentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length].fill} stroke={DONUT_COLORS[index % DONUT_COLORS.length].stroke} strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {departmentData.map((entry, index) => (
                        <div key={index} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded-full" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length].fill }} />
                            <span className="text-sm font-medium">{entry.name}</span>
                          </div>
                          <Badge variant="secondary" className="font-semibold">{entry.value}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="projects" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-indigo-600" />
                  Project Utilization
                </CardTitle>
                <CardDescription>Employee allocation and utilization by project</CardDescription>
              </CardHeader>
              <CardContent>
                {projectUtilization.length === 0 ? (
                  <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                    <p>No data available</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={450}>
                    <BarChart data={projectUtilization} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis dataKey="project_name" type="category" width={150} className="text-xs" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="assigned_employees" fill="#6366f1" name="Assigned Employees" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="avg_allocation" fill="#8b5cf6" name="Avg Allocation %" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skills" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-pink-600" />
                  Top Skills
                </CardTitle>
                <CardDescription>Most common skills and average proficiency levels</CardDescription>
              </CardHeader>
              <CardContent>
                {topSkills.length === 0 ? (
                  <div className="h-[450px] flex items-center justify-center text-muted-foreground">
                    <p>No data available</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={450}>
                    <BarChart data={topSkills} margin={{ left: 20, right: 20, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} className="text-xs" />
                      <YAxis yAxisId="left" className="text-xs" />
                      <YAxis yAxisId="right" orientation="right" className="text-xs" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="count" fill="#ec4899" name="Employees with Skill" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="avg_level" fill="#8b5cf6" name="Avg Skill Level" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
