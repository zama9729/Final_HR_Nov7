import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { motion } from "framer-motion";

const gradientIdCost = "payrollCostGradient";
const gradientIdExpense = "payrollExpenseGradient";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/95 p-3 shadow-xl backdrop-blur">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="mt-1 flex items-center justify-between gap-6 text-sm">
          <span className="flex items-center gap-2 font-medium text-slate-600">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.name}
          </span>
          <span className="font-semibold text-slate-900">${item.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function PayrollChart({ data = [], months = [] }) {
  const chartData =
    data.length > 0
      ? months.map((month, idx) => ({
          month,
          Cost: data[0]?.data[idx] ?? 0,
          Expense: data[1]?.data[idx] ?? 0,
        }))
      : [];

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-lg shadow-black/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Payroll Cost</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">$128,450</p>
          <p className="text-xs text-slate-500">YoY ▲ 4.5% vs last year</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Monthly
        </motion.button>
      </div>

      <div className="mt-6 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={gradientIdCost} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="90%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={gradientIdExpense} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                <stop offset="90%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8" }} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94a3b8" }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#cbd5f5", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="Cost"
              stroke="#6366f1"
              strokeWidth={3}
              fillOpacity={1}
              fill={`url(#${gradientIdCost})`}
            />
            <Area
              type="monotone"
              dataKey="Expense"
              stroke="#f97316"
              strokeWidth={3}
              fillOpacity={1}
              fill={`url(#${gradientIdExpense})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

