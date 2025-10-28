import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--muted))"];

export default function Analytics() {
  const [employeeGrowth, setEmployeeGrowth] = useState<Array<{ month: string; count: number }>>([]);
  const [departmentData, setDepartmentData] = useState<Array<{ name: string; value: number }>>([]);
  const [leaveData, setLeaveData] = useState<Array<{ month: string; approved: number; pending: number; rejected: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    const now = new Date();
    
    try {
      // Fetch employee growth data (last 6 months)
      const { data: employees } = await supabase
        .from('employees')
        .select('created_at')
        .eq('status', 'active')
        .order('created_at');

      if (employees) {
        const monthCounts: { [key: string]: number } = {};
        
        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          monthCounts[monthKey] = 0;
        }

        // Count employees by month
        employees.forEach(emp => {
          const date = new Date(emp.created_at);
          const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          if (monthKey in monthCounts) {
            monthCounts[monthKey]++;
          }
        });

        setEmployeeGrowth(Object.entries(monthCounts).map(([month, count]) => ({ month, count })));
      }

      // Fetch department distribution
      const { data: deptData } = await supabase
        .from('employees')
        .select('department')
        .eq('status', 'active');

      if (deptData) {
        const deptCounts: { [key: string]: number } = {};
        deptData.forEach(emp => {
          if (emp.department) {
            deptCounts[emp.department] = (deptCounts[emp.department] || 0) + 1;
          }
        });
        setDepartmentData(Object.entries(deptCounts).map(([name, value]) => ({ name, value })));
      }

      // Fetch leave requests trend (last 6 months)
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('submitted_at, status')
        .gte('submitted_at', new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString());

      if (leaves) {
        const leaveCounts: { [key: string]: { approved: number; pending: number; rejected: number } } = {};
        
        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          leaveCounts[monthKey] = { approved: 0, pending: 0, rejected: 0 };
        }

        // Count leaves by month and status
        leaves.forEach(leave => {
          const date = new Date(leave.submitted_at);
          const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          if (monthKey in leaveCounts && leave.status in leaveCounts[monthKey]) {
            leaveCounts[monthKey][leave.status as keyof typeof leaveCounts[typeof monthKey]]++;
          }
        });

        setLeaveData(Object.entries(leaveCounts).map(([month, counts]) => ({ month, ...counts })));
      }
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
          <div className="animate-pulse">Loading analytics...</div>
        </div>
      </AppLayout>
    );
  }
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Insights and trends across your organization</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="leaves">Leaves</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Employee Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  {employeeGrowth.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <p>No data available</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={employeeGrowth}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" stroke="hsl(var(--foreground))" />
                        <YAxis stroke="hsl(var(--foreground))" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "var(--radius)",
                          }}
                        />
                        <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Department Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {departmentData.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <p>No data available</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={departmentData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {departmentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "var(--radius)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="leaves" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Leave Requests Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {leaveData.length === 0 ? (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    <p>No data available</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={leaveData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" stroke="hsl(var(--foreground))" />
                      <YAxis stroke="hsl(var(--foreground))" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "var(--radius)",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="approved" fill="hsl(var(--success))" />
                      <Bar dataKey="pending" fill="hsl(var(--warning))" />
                      <Bar dataKey="rejected" fill="hsl(var(--destructive))" />
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
