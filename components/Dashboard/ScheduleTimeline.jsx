import { AvatarStack } from "./components/AvatarStack";
import Image from "next/image";

const hours = ["08:00", "10:00", "12:00", "14:00", "16:00"];

const EventChip = ({ event }) => (
  <div className="min-w-[180px] rounded-2xl bg-slate-900 text-white shadow-lg shadow-black/20">
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex -space-x-2">
        {event.avatars?.slice(0, 3).map((avatar, idx) => (
          <span key={idx} className="inline-flex h-7 w-7 rounded-full border-2 border-slate-900 bg-white">
            <Image src={avatar} alt="" width={28} height={28} className="rounded-full object-cover" />
          </span>
        ))}
      </div>
      <div>
        <p className="text-sm font-semibold">{event.title}</p>
        <p className="text-xs text-slate-300">
          {event.startTime} - {event.endTime}
        </p>
      </div>
    </div>
  </div>
);

export default function ScheduleTimeline({ schedule = [] }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-lg shadow-black/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Meeting & Interviews
          </p>
          <p className="text-xl font-bold text-slate-900">Today&apos;s Timeline</p>
        </div>
        <button className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          View All
        </button>
      </div>

      <div className="mt-6">
        <div className="grid grid-cols-6 gap-6">
          <div className="space-y-10 text-sm text-slate-400">
            {hours.map((hour) => (
              <div key={hour} className="text-right text-xs font-medium">
                {hour}
              </div>
            ))}
          </div>
          <div className="col-span-5">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 right-0">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-l border-dashed border-slate-200"
                    style={{
                      position: "absolute",
                      top: `${(hours.indexOf(hour) / (hours.length - 1)) * 100}%`,
                      bottom: "auto",
                      height: 1,
                      width: "100%",
                      transform: "translateY(-50%)",
                    }}
                  />
                ))}
              </div>
              <div className="relative flex flex-col gap-4">
                {schedule.map((event) => (
                  <div key={event.id} className="relative">
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="font-semibold">{event.day}</span>
                      <span className="text-slate-400">{event.date}</span>
                    </div>
                    <div className="mt-2">
                      <EventChip event={event} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

