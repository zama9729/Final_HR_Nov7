import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

interface TenantMetricsViewProps {
  tenantId: string;
}

export function TenantMetricsView({ tenantId }: TenantMetricsViewProps) {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading } = useQuery({
    queryKey: ['observability', 'tenant-metrics', tenantId, days],
    queryFn: () => api.getTenantMetrics(tenantId, days),
    enabled: !!tenantId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const metrics = data?.metrics || [];

  // Prepare chart data
  const chartData = metrics.map((m: any) => ({
    date: format(new Date(m.date), 'MMM dd'),
    fullDate: m.date,
    activeUsers: m.active_users_count || 0,
    payrollRuns: m.payroll_runs_count || 0,
    attendanceEvents: m.attendance_events_count || 0,
    leaveRequests: m.leave_requests_count || 0,
    expenseClaims: m.expense_claims_count || 0,
    apiRequests: m.api_requests_count || 0,
    apiErrors: m.api_error_count || 0,
    errorRate: parseFloat(m.error_rate_pct || 0),
    storageMb: parseFloat(m.storage_used_mb || 0),
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Tenant Metrics</h3>
        <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="60">60 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active Users Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Active Users Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="activeUsers"
                stroke="#8884d8"
                fill="#8884d8"
                fillOpacity={0.6}
                name="Active Users"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Activity Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Activity Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="payrollRuns" fill="#8884d8" name="Payroll Runs" />
              <Bar dataKey="attendanceEvents" fill="#82ca9d" name="Attendance Events" />
              <Bar dataKey="leaveRequests" fill="#ffc658" name="Leave Requests" />
              <Bar dataKey="expenseClaims" fill="#ff7300" name="Expense Claims" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* API Metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">API Requests & Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="apiRequests"
                  stroke="#8884d8"
                  name="API Requests"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="apiErrors"
                  stroke="#ff7300"
                  name="API Errors"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Error Rate & Storage</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="errorRate"
                  stroke="#ff7300"
                  name="Error Rate %"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="storageMb"
                  stroke="#82ca9d"
                  name="Storage (MB)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

