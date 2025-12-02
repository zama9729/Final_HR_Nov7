import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
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
  Download,
  FileText,
  History,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

interface EmployeeHistoryTabProps {
  employeeId: string;
  isOwnProfile?: boolean;
}

const EVENT_TYPE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  PROMOTION: { icon: ArrowUpCircle, color: 'bg-blue-100 text-blue-800', label: 'Promotion' },
  APPRAISAL: { icon: Star, color: 'bg-yellow-100 text-yellow-800', label: 'Appraisal' },
  HIKE: { icon: DollarSign, color: 'bg-green-100 text-green-800', label: 'Salary Hike' },
  PROJECT_ASSIGNMENT: { icon: Briefcase, color: 'bg-purple-100 text-purple-800', label: 'Project' },
  PROJECT_END: { icon: Briefcase, color: 'bg-gray-100 text-gray-800', label: 'Project End' },
  JOINING: { icon: UserPlus, color: 'bg-indigo-100 text-indigo-800', label: 'Joining' },
  TRANSFER: { icon: ArrowRight, color: 'bg-orange-100 text-orange-800', label: 'Transfer' },
  ROLE_CHANGE: { icon: Building2, color: 'bg-cyan-100 text-cyan-800', label: 'Role Change' },
  AWARD: { icon: Award, color: 'bg-pink-100 text-pink-800', label: 'Award' },
};

export default function EmployeeHistoryTab({ employeeId, isOwnProfile = true }: EmployeeHistoryTabProps) {
  const { toast } = useToast();
  const [history, setHistory] = useState<{ events: EmployeeEvent[]; grouped: Record<string, Record<string, EmployeeEvent[]>> }>({ events: [], grouped: {} });
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EmployeeEvent | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (employeeId) {
      fetchHistory();
    }
  }, [employeeId, selectedYear, selectedTypes]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      // Use getEmployeeHistory if viewing someone else's profile, otherwise getMyHistory
      const data = isOwnProfile
        ? await api.getMyHistory({
            year: selectedYear || undefined,
            types: selectedTypes.length > 0 ? selectedTypes : undefined,
          })
        : await api.getEmployeeHistory(employeeId, {
            year: selectedYear || undefined,
            types: selectedTypes.length > 0 ? selectedTypes : undefined,
          });
      setHistory(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const years = Object.keys(history.grouped || {}).map(y => parseInt(y)).sort((a, b) => b - a);
  const allEventTypes = Array.from(new Set(history.events.map(e => e.event_type)));

  const handleEventClick = (event: EmployeeEvent) => {
    setSelectedEvent(event);
    setEventDialogOpen(true);
  };

  const toggleEventType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const exportToCSV = () => {
    try {
      setExporting(true);
      const events = history.events || [];
      if (events.length === 0) {
        toast({
          title: 'No Data',
          description: 'No events to export',
          variant: 'destructive',
        });
        return;
      }

      const headers = ['Date', 'Event Type', 'Title', 'Description', 'Details'];
      const rows = events.map(event => {
        const date = format(new Date(event.event_date), 'yyyy-MM-dd');
        const config = EVENT_TYPE_CONFIG[event.event_type] || { label: event.event_type };
        const details = event.metadata_json ? JSON.stringify(event.metadata_json) : '';
        return [
          date,
          config.label,
          event.title,
          event.description || '',
          details,
        ];
      });

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `employee-history-${employeeId}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Success',
        description: 'History exported to CSV',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to export',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const renderEventCard = (event: EmployeeEvent) => {
    const config = EVENT_TYPE_CONFIG[event.event_type] || { icon: Briefcase, color: 'bg-gray-100 text-gray-800', label: event.event_type };
    const Icon = config.icon;

    return (
      <Card
        key={event.id}
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => handleEventClick(event)}
      >
        <CardContent className="pt-4">
          <div className="flex items-start gap-4">
            <div className={`p-2 rounded-lg ${config.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={config.color}>
                  {config.label}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {format(new Date(event.event_date), 'MMM dd, yyyy')}
                </span>
              </div>
              <h3 className="font-semibold mb-1">{event.title}</h3>
              {event.description && (
                <p className="text-sm text-muted-foreground">{event.description}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Filters</CardTitle>
            {history.events.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={exporting}
              >
                <Download className="h-4 w-4 mr-2" />
                {exporting ? 'Exporting...' : 'Export CSV'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Year</label>
              <Select
                value={selectedYear?.toString() || 'all'}
                onValueChange={(value) => setSelectedYear(value === 'all' ? null : parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Event Types</label>
              <div className="flex flex-wrap gap-2">
                {allEventTypes.map(type => {
                  const config = EVENT_TYPE_CONFIG[type] || { label: type };
                  return (
                    <div key={type} className="flex items-center space-x-2">
                      <Checkbox
                        id={type}
                        checked={selectedTypes.includes(type)}
                        onCheckedChange={() => toggleEventType(type)}
                      />
                      <label
                        htmlFor={type}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {config.label}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading history...</div>
      ) : years.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No history events found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {years.map(year => (
            <div key={year}>
              <h2 className="text-2xl font-bold mb-4 sticky top-0 bg-background py-2 z-10">
                {year}
              </h2>
              {Object.entries(history.grouped[year] || {})
                .sort(([monthA], [monthB]) => {
                  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                  return months.indexOf(monthB) - months.indexOf(monthA);
                })
                .map(([month, events]) => (
                  <div key={month} className="mb-6">
                    <h3 className="text-lg font-semibold mb-3 text-muted-foreground">
                      {month}
                    </h3>
                    <div className="space-y-3">
                      {events.map(renderEventCard)}
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      {/* Event Detail Dialog */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title}</DialogTitle>
            <DialogDescription>
              {selectedEvent && format(new Date(selectedEvent.event_date), 'MMMM dd, yyyy')}
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              {selectedEvent.description && (
                <p className="text-sm">{selectedEvent.description}</p>
              )}
              {selectedEvent.metadata_json && Object.keys(selectedEvent.metadata_json).length > 0 && (
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Details</h4>
                  <div className="space-y-2 text-sm">
                    {Object.entries(selectedEvent.metadata_json).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}:
                        </span>
                        <span className="font-medium">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

