import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  resource: {
    type: string;
    project_id: string;
    project_name: string;
    employee_id: string;
    employee_name: string;
    allocation_percent: number;
    role?: string;
  };
};

export default function ProjectCalendar() {
  const { userRole } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const isHROrCEO = ['hr', 'ceo', 'director'].includes(userRole || '');

  const loadCalendar = async () => {
    try {
      setLoading(true);
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      
      const params = new URLSearchParams({
        start_date: monthStart.toISOString().split('T')[0],
        end_date: monthEnd.toISOString().split('T')[0],
      });
      
      if (selectedEmployee) params.append('employee_id', selectedEmployee);
      if (selectedProject) params.append('project_id', selectedProject);

      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/calendar?${params}`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
      );
      
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        console.error('Failed to load calendar:', errorData.error || resp.statusText);
        setEvents([]);
        setProjects([]);
        setEmployees([]);
        setAvailability([]);
        return;
      }
      
      const data = await resp.json();
      setEvents(data.events || []);
      setProjects(data.projects || []);
      setEmployees(data.employees || []);
      setAvailability(data.availability || []);
    } catch (error) {
      console.error('Error loading calendar:', error);
      setEvents([]);
      setProjects([]);
      setEmployees([]);
      setAvailability([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendar();
  }, [currentMonth, selectedEmployee, selectedProject]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
  };

  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    return days;
  };

  const getEventsForDay = (day: number | null) => {
    if (day === null) return [];
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(event => {
      const eventStart = new Date(event.start);
      const eventEnd = event.end ? new Date(event.end) : null;
      const checkDate = new Date(dateStr);
      
      return checkDate >= eventStart && (!eventEnd || checkDate <= eventEnd);
    });
  };

  const getAvailabilityForDay = (day: number | null) => {
    if (day === null) return [];
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return availability.filter(avail => {
      const availStart = new Date(avail.start);
      const availEnd = new Date(avail.end);
      const checkDate = new Date(dateStr);
      return checkDate >= availStart && checkDate < availEnd;
    });
  };

  const days = getDaysInMonth();
  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Project Calendar</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => navigateMonth('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {isHROrCEO && (
                <div>
                  <label className="block text-sm font-medium mb-1">Employee</label>
                  <Select value={selectedEmployee || 'all'} onValueChange={(v) => setSelectedEmployee(v === 'all' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Employees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Project</label>
                <Select value={selectedProject || 'all'} onValueChange={(v) => setSelectedProject(v === 'all' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map(proj => (
                      <SelectItem key={proj.id} value={proj.id}>{proj.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={() => {
                  setSelectedEmployee('');
                  setSelectedProject('');
                  setCurrentMonth(new Date());
                }}>Clear Filters</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar */}
        {loading ? (
          <Card><CardContent className="p-8 text-center">Loading calendar...</CardContent></Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">{monthName}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1">
                {/* Day headers */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="p-2 text-center font-semibold text-sm bg-muted">
                    {day}
                  </div>
                ))}
                
                {/* Calendar days */}
                {days.map((day, idx) => {
                  const dayEvents = getEventsForDay(day);
                  const dayAvailability = getAvailabilityForDay(day);
                  const isToday = day !== null && 
                    new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={idx}
                      className={`min-h-[80px] p-1 border rounded text-sm ${
                        day === null ? 'bg-muted/30' : 'bg-background'
                      } ${isToday ? 'ring-2 ring-primary' : ''}`}
                    >
                      {day !== null && (
                        <>
                          <div className={`font-medium mb-1 ${isToday ? 'text-primary' : ''}`}>
                            {day}
                          </div>
                          <div className="space-y-0.5">
                            {dayEvents.slice(0, 2).map(event => (
                              <div
                                key={event.id}
                                className="text-xs p-1 rounded truncate bg-blue-100 dark:bg-blue-900 cursor-pointer hover:opacity-80"
                                title={`${event.resource.project_name} - ${event.resource.employee_name} (${event.resource.allocation_percent}%)`}
                              >
                                <div className="font-medium truncate">{event.resource.project_name}</div>
                                <div className="text-muted-foreground truncate">
                                  {event.resource.employee_name} ({event.resource.allocation_percent}%)
                                </div>
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <div className="text-xs text-muted-foreground">+{dayEvents.length - 2} more</div>
                            )}
                            {dayAvailability.length > 0 && dayEvents.length === 0 && (
                              <div className="text-xs p-1 rounded bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                                Available
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Legend */}
        <Card>
          <CardHeader><CardTitle>Legend</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-100 dark:bg-blue-900"></div>
                <span>Project Assignment</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-900"></div>
                <span>Available Period</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded ring-2 ring-primary"></div>
                <span>Today</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Events List */}
        {events.length > 0 && (
          <Card>
            <CardHeader><CardTitle>All Assignments ({events.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {events.map(event => (
                  <div key={event.id} className="p-2 border rounded text-sm">
                    <div className="font-medium">{event.resource.project_name}</div>
                    <div className="text-muted-foreground">
                      {event.resource.employee_name} • {event.resource.allocation_percent}% allocation
                      {event.resource.role && ` • ${event.resource.role}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(event.start).toLocaleDateString()} - {event.end ? new Date(event.end).toLocaleDateString() : 'Ongoing'}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
