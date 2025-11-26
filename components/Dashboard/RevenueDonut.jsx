import { Pie, PieChart, ResponsiveContainer, Cell } from "recharts";

const COLORS = ["#6366f1", "#f97316", "#22c55e", "#0ea5e9"];

export default function RevenueDonut({ data = [], total = 0 }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-lg shadow-black/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Revenue Overview</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">${total.toLocaleString()}</p>
          <p className="text-xs text-slate-500">Split by business units</p>
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[180px_1fr]">
        <div className="mx-auto h-48 w-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={3}
                dataKey="percent"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none -mt-36 flex flex-col items-center justify-center text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
            <p className="text-xl font-semibold text-slate-900">${total.toLocaleString()}</p>
          </div>
        </div>
        <div className="space-y-3">
          {data.map((item, idx) => (
            <div
              key={item.name}
              className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <div>
                  <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.percent}%</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-900">${item.amount.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

