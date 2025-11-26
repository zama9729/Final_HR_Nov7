import { cn } from "@/lib/utils";

const gradientMap = {
  pink: "bg-gradient-to-br from-[#ffe0f0] to-[#ffc2d4]",
  blue: "bg-gradient-to-br from-[#dfe8ff] to-[#c5d8ff]",
  mint: "bg-gradient-to-br from-[#dfffea] to-[#c7f7dd]",
  sun: "bg-gradient-to-br from-[#fff3d1] to-[#ffe1a8]",
};

export default function SummaryCard({
  title,
  value,
  trendLabel,
  trendVariant = "positive",
  updatedAt,
  icon: Icon,
  gradient = "pink",
}) {
  return (
    <article
      className={cn(
        "rounded-2xl p-5 text-slate-900 shadow-lg shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-2xl",
        gradientMap[gradient]
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600/70 uppercase tracking-wide">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        {Icon ? (
          <span className="rounded-full bg-white/70 p-3 text-slate-800 shadow-inner">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            trendVariant === "positive"
              ? "bg-white/70 text-emerald-600"
              : "bg-white/70 text-rose-600"
          )}
        >
          {trendLabel}
        </span>
        <span className="text-xs font-medium text-slate-600/70">Updated {updatedAt}</span>
      </div>
    </article>
  );
}

