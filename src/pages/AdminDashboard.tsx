import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { DateRange } from "react-day-picker";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { DateRangePicker } from "@/components/ui/DateRangePicker";

type MetricsResponse = {
  totals: {
    organizations: number;
    users: number;
    employees: number;
    revenue: number;
    mrr: number;
  };
  series: {
    organizationsByDay: { day: string; count: number }[];
    revenueByMonth: { month: string; amount: number }[];
  };
};

async function fetchMetrics(): Promise<MetricsResponse> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/metrics`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    },
  });
  if (!res.ok) throw new Error("Failed to load metrics");
  return res.json();
}

export default function AdminDashboard() {
  const [range, setRange] = useState<DateRange | undefined>();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: fetchMetrics,
  });

  useEffect(() => {
    const id = setInterval(() => refetch(), 60_000);
    return () => clearInterval(id);
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-8 w-24 mb-2" /><Skeleton className="h-6 w-16" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return <div className="text-red-600">Failed to load metrics</div>;
  }

  const from = range?.from ? range.from.toISOString() : undefined;
  const to = range?.to ? range.to.toISOString() : undefined;

  const exportCsv = async () => {
    const token = localStorage.getItem("token");
    const url = new URL(`${import.meta.env.VITE_API_URL}/api/admin/payments/export.csv`);
    if (from) url.searchParams.set('from', from);
    if (to) url.searchParams.set('to', to);
    const res = await fetch(url, { headers: { Authorization: token ? `Bearer ${token}` : "" } });
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'payments.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground">Filter range (payments export):</div>
        <DateRangePicker
          startDate={range?.from}
          endDate={range?.to}
          onChange={(start, end) => setRange({ from: start, to: end })}
          mode="range"
          placeholder="Select date range"
        />
        <Button variant="secondary" onClick={exportCsv}>Export Payments CSV</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Total Organizations</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{data.totals.organizations}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Users</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{data.totals.users}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Employees</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{data.totals.employees}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>MRR</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">${data.totals.mrr.toLocaleString()}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Organizations - Last 30 Days</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series.organizationsByDay} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Revenue by Month</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series.revenueByMonth} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="amount" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


