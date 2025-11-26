import Image from "next/image";

export default function ActivityLog({ items = [] }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-lg shadow-black/5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Activity</p>
        <button className="text-sm font-semibold text-slate-500 hover:text-slate-900">View all</button>
      </div>
      <div className="mt-4 space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 px-3 py-2">
            <span className="inline-flex h-10 w-10 overflow-hidden rounded-full bg-slate-100">
              <Image
                src={item.avatar}
                alt={item.name}
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
              <p className="text-xs text-slate-500">
                {item.role} · <span className="font-medium">{item.action}</span>
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

