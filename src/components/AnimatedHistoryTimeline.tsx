import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import {
  ArrowUpCircle,
  Star,
  DollarSign,
  Briefcase,
  UserPlus,
  ArrowRight,
  Building2,
  Award,
  History,
  Calendar,
  CheckCircle,
} from 'lucide-react';

interface EmployeeEvent {
  id: string;
  event_type: string;
  event_date: string;
  title: string;
  description?: string;
  metadata_json: any;
  source_table?: string;
  source_id?: string;
  created_at: string;
}

interface AnimatedHistoryTimelineProps {
  events: EmployeeEvent[];
  loading?: boolean;
}

const EVENT_TYPE_CONFIG: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
  PROMOTION: { icon: ArrowUpCircle, color: 'text-blue-600', bgColor: 'bg-blue-50', label: 'Promotion' },
  APPRAISAL: { icon: Star, color: 'text-yellow-600', bgColor: 'bg-yellow-50', label: 'Appraisal' },
  HIKE: { icon: DollarSign, color: 'text-green-600', bgColor: 'bg-green-50', label: 'Salary Hike' },
  PROJECT_ASSIGNMENT: { icon: Briefcase, color: 'text-purple-600', bgColor: 'bg-purple-50', label: 'Project' },
  PROJECT_END: { icon: Briefcase, color: 'text-gray-600', bgColor: 'bg-gray-50', label: 'Project End' },
  JOINING: { icon: UserPlus, color: 'text-indigo-600', bgColor: 'bg-indigo-50', label: 'Joined Company' },
  PROBATION_START: { icon: History, color: 'text-sky-600', bgColor: 'bg-sky-50', label: 'Probation Started' },
  PROBATION_END: { icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50', label: 'Probation Completed' },
  TRANSFER: { icon: ArrowRight, color: 'text-orange-600', bgColor: 'bg-orange-50', label: 'Transfer' },
  ROLE_CHANGE: { icon: Building2, color: 'text-cyan-600', bgColor: 'bg-cyan-50', label: 'Role Change' },
  DEPARTMENT_CHANGE: { icon: Building2, color: 'text-cyan-600', bgColor: 'bg-cyan-50', label: 'Department Change' },
  AWARD: { icon: Award, color: 'text-pink-600', bgColor: 'bg-pink-50', label: 'Award' },
  ANNIVERSARY: { icon: Calendar, color: 'text-rose-600', bgColor: 'bg-rose-50', label: 'Anniversary' },
  TERMINATION: { icon: UserPlus, color: 'text-red-600', bgColor: 'bg-red-50', label: 'Termination' },
  RESIGNATION: { icon: UserPlus, color: 'text-red-600', bgColor: 'bg-red-50', label: 'Resignation' },
  TRAINING: { icon: Award, color: 'text-violet-600', bgColor: 'bg-violet-50', label: 'Training' },
  OTHER: { icon: History, color: 'text-gray-600', bgColor: 'bg-gray-50', label: 'Other' },
};

export default function AnimatedHistoryTimeline({ events, loading = false }: AnimatedHistoryTimelineProps) {
  const [animatedEvents, setAnimatedEvents] = useState<EmployeeEvent[]>([]);
  const [lineProgress, setLineProgress] = useState<Record<string, number>>({});
  const timelineRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Sort events by date (newest first)
  const sortedEvents = [...events].sort((a, b) => {
    return new Date(b.event_date).getTime() - new Date(a.event_date).getTime();
  });

  useEffect(() => {
    if (loading || sortedEvents.length === 0) return;

    // Reset animation state
    setAnimatedEvents([]);
    setLineProgress({});

    // Animate events appearing one by one
    sortedEvents.forEach((event, index) => {
      setTimeout(() => {
        setAnimatedEvents((prev) => [...prev, event]);
      }, index * 150); // 150ms delay between each event
    });

    // Animate connecting lines
    sortedEvents.forEach((event, index) => {
      if (index < sortedEvents.length - 1) {
        setTimeout(() => {
          setLineProgress((prev) => ({
            ...prev,
            [event.id]: 100,
          }));
        }, index * 150 + 200);
      }
    });
  }, [events, loading]);

  if (loading) {
    return (
      <div className="text-center py-8 text-sm text-gray-500">
        Loading history...
      </div>
    );
  }

  if (sortedEvents.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No history events found</p>
        <p className="text-xs mt-2 text-gray-400">Events like joining, promotions, and probation will appear here</p>
      </div>
    );
  }

  return (
    <div ref={timelineRef} className="relative">
      <div className="space-y-6">
        {sortedEvents.map((event, index) => {
          const config = EVENT_TYPE_CONFIG[event.event_type] || {
            icon: Briefcase,
            color: 'text-gray-600',
            bgColor: 'bg-gray-50',
            label: event.event_type,
          };
          const Icon = config.icon;
          const isVisible = animatedEvents.some((e) => e.id === event.id);
          const isLast = index === sortedEvents.length - 1;
          const lineProgressValue = lineProgress[event.id] || 0;

          return (
            <div key={event.id} className="relative flex gap-4">
              {/* Timeline line and dot */}
              <div className="flex flex-col items-center">
                {/* Dot */}
                <div
                  ref={(el) => {
                    if (el) dotRefs.current.set(event.id, el);
                  }}
                  className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white shadow-md transition-all duration-500 ${
                    isVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                  } ${config.bgColor}`}
                  style={{
                    transitionDelay: `${index * 150}ms`,
                  }}
                >
                  <Icon className={`h-5 w-5 ${config.color}`} />
                </div>

                {/* Connecting line */}
                {!isLast && (
                  <div
                    className="relative mt-2 w-0.5 bg-gray-200"
                    style={{ height: 'calc(100% + 1.5rem)' }}
                  >
                    <div
                      className={`absolute top-0 left-0 w-full bg-gradient-to-b from-blue-400 to-blue-600 transition-all duration-700 ease-out ${
                        lineProgressValue > 0 ? 'opacity-100' : 'opacity-0'
                      }`}
                      style={{
                        height: `${lineProgressValue}%`,
                        transitionDelay: `${index * 150 + 200}ms`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Event card */}
              <div
                className={`flex-1 pb-6 transition-all duration-500 ${
                  isVisible ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
                }`}
                style={{
                  transitionDelay: `${index * 150}ms`,
                }}
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className={`${config.bgColor} ${config.color} border-0`}>
                            {config.label}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {format(new Date(event.event_date), 'MMM dd, yyyy')}
                          </span>
                        </div>
                        <h3 className="font-semibold text-gray-900 mb-1">{event.title}</h3>
                        {event.description && (
                          <p className="text-sm text-gray-600">{event.description}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

