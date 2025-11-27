export async function fetchDashboardSummary() {
  const res = await fetch("/api/dashboard/summary");
  if (!res.ok) throw new Error("Failed to load dashboard summary");
  return res.json();
}

export async function fetchPayroll(range = "monthly") {
  const res = await fetch(`/api/dashboard/payroll?range=${range}`);
  if (!res.ok) throw new Error("Failed to load payroll data");
  return res.json();
}

export async function fetchRevenue() {
  const res = await fetch("/api/dashboard/revenue");
  if (!res.ok) throw new Error("Failed to load revenue breakdown");
  return res.json();
}

export async function fetchSchedule(params) {
  const search = new URLSearchParams(params).toString();
  const res = await fetch(`/api/dashboard/schedule?${search}`);
  if (!res.ok) throw new Error("Failed to load schedule");
  return res.json();
}

export async function fetchActivity() {
  const res = await fetch("/api/dashboard/activity");
  if (!res.ok) throw new Error("Failed to load activity log");
  return res.json();
}

export async function exportDashboardCSV(range = "monthly") {
  const res = await fetch(`/api/export/dashboard?range=${range}`);
  if (!res.ok) throw new Error("Failed to export data");
  return res.blob();
}

