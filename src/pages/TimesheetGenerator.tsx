import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Loader2, Download, Send, Calendar, User, Building, FileText, CheckCircle2, Eye, Edit, Save } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Employee {
  id: string;
  employee_id?: string;
  profiles?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

interface Project {
  id: string;
  name: string;
  code?: string;
}

interface TimesheetSummary {
  totalDays: number;
  workingDays: number;
  billableDays: number;
  holidays: number;
  weekends: number;
  birthdays: number;
  nonWorkingDays: number;
}

export default function TimesheetGenerator() {
  const { employeeId: paramEmployeeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const { toast } = useToast();

  const [employeeId, setEmployeeId] = useState<string>(paramEmployeeId || '');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [month, setMonth] = useState<string>(() => {
    const defaultMonth = searchParams.get('month') || format(startOfMonth(new Date()), 'yyyy-MM');
    return defaultMonth;
  });
  const [clientName, setClientName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<TimesheetSummary | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [excelData, setExcelData] = useState<any[][]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editedData, setEditedData] = useState<any[][]>([]);

  // Check if user can access this employee's timesheet
  const isPrivileged = ['hr', 'director', 'ceo', 'admin', 'manager'].includes(userRole || '');
  const canAccess = isPrivileged || (employee && employee.id === user?.id);

  useEffect(() => {
    const loadEmployee = async () => {
      if (!employeeId) {
        // If no employee ID, try to get current user's employee ID
        try {
          const me = await api.getEmployeeId();
          if (me?.id) {
            setEmployeeId(me.id);
            const emp = await api.getEmployee(me.id);
            setEmployee(emp as Employee);
          }
        } catch (error) {
          console.error('Failed to load employee:', error);
        }
        return;
      }

      try {
        setLoading(true);
        const emp = await api.getEmployee(employeeId);
        setEmployee(emp as Employee);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to load employee',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    loadEmployee();
  }, [employeeId, toast]);

  useEffect(() => {
    const loadProjects = async () => {
      if (!employeeId) return;

      try {
        const projectsData = await api.get(`/api/v1/employees/${employeeId}/projects?type=active`);
        if (projectsData && Array.isArray(projectsData)) {
          setProjects(projectsData);
          if (projectsData.length > 0 && !selectedProject) {
            setSelectedProject(projectsData[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
      }
    };

    loadProjects();
  }, [employeeId, selectedProject]);

  const handleGenerate = async () => {
    if (!employeeId || !month) {
      toast({
        title: 'Missing Information',
        description: 'Please select an employee and month',
        variant: 'destructive',
      });
      return;
    }

    try {
      setGenerating(true);
      const token = api.token || localStorage.getItem('auth_token');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(
        `${apiUrl}/api/timesheets/${employeeId}/export?month=${month}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to generate timesheet' }));
        throw new Error(error.error || 'Failed to generate timesheet');
      }

      // Parse Excel file for preview
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      
      setExcelData(jsonData as any[][]);
      setEditedData(JSON.parse(JSON.stringify(jsonData)) as any[][]); // Deep copy
      setShowPreview(true);

      toast({
        title: 'Success',
        description: 'Timesheet generated. Review and edit before downloading.',
      });

      // Load summary for preview
      await loadSummary();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate timesheet',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const loadSummary = async () => {
    if (!employeeId || !month) return;

    try {
      // Calculate summary from month
      const [year, monthNum] = month.split('-').map(Number);
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0);
      
      // Get holidays for the month
      let holidays = [];
      try {
        const holidaysRes = await api.get(`/api/holidays?year=${year}&month=${monthNum}`);
        holidays = holidaysRes?.holidays || [];
      } catch (error) {
        console.error('Failed to load holidays:', error);
        holidays = [];
      }
      
      // Calculate days
      const totalDays = monthEnd.getDate();
      let workingDays = 0;
      let weekendDays = 0;
      const holidayDates = new Set(holidays.map((h: any) => {
        const date = h.date instanceof Date ? h.date : new Date(h.date);
        return date.toISOString().split('T')[0];
      }));

      for (let day = 1; day <= totalDays; day++) {
        const date = new Date(year, monthNum - 1, day);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dateStr = date.toISOString().split('T')[0];
        const isHoliday = holidayDates.has(dateStr);
        
        if (isWeekend) {
          weekendDays++;
        } else if (!isHoliday) {
          workingDays++;
        }
      }

      setSummary({
        totalDays,
        workingDays,
        billableDays: workingDays, // Same as working days (excluding holidays, weekends, birthdays)
        holidays: holidays.length,
        weekends: weekendDays,
        birthdays: 0, // Would need to check employee DOB
        nonWorkingDays: totalDays - workingDays - weekendDays,
      });
    } catch (error) {
      console.error('Failed to load summary:', error);
    }
  };

  useEffect(() => {
    loadSummary();
  }, [employeeId, month]);

  const handleCellEdit = (row: number, col: number, value: string) => {
    const newData = [...editedData];
    if (!newData[row]) {
      newData[row] = [];
    }
    newData[row][col] = value;
    setEditedData(newData);
  };

  const handleDownload = () => {
    try {
      // Create workbook from edited data
      const ws = XLSX.utils.aoa_to_sheet(editedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
      
      // Generate filename
      const [year, monthNum] = month.split('-').map(Number);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = monthNames[monthNum - 1];
      const employeeName = employee
        ? `${employee.profiles?.first_name || ''}_${employee.profiles?.last_name || ''}`.replace(/\s+/g, '_')
        : 'Employee';
      const filename = `${employeeName}-Timesheet-${monthName}-${year}.xlsx`;
      
      // Download
      XLSX.writeFile(wb, filename);
      
      toast({
        title: 'Success',
        description: 'Timesheet downloaded successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to download timesheet',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!employeeId || !month) {
      toast({
        title: 'Missing Information',
        description: 'Please generate timesheet first',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      await api.post(`/api/timesheets/${employeeId}/submit`, {
        month,
        clientName: clientName || undefined,
        notes: undefined,
      });

      toast({
        title: 'Success',
        description: 'Timesheet submitted successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit timesheet',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="text-center py-12">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (!employee && !paramEmployeeId) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-4xl mx-auto">
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Please select an employee to generate timesheet
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const employeeName = employee
    ? `${employee.profiles?.first_name || ''} ${employee.profiles?.last_name || ''}`.trim()
    : 'Employee';

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Generate Timesheet</h1>
          <p className="text-muted-foreground mt-1">
            Generate and export timesheet Excel file for client submission
          </p>
        </div>

        {/* Employee Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Employee Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Employee Name</Label>
                <p className="font-medium">{employeeName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Employee ID</Label>
                <p className="font-medium">{employee?.employee_id || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Project</Label>
                <p className="font-medium">
                  {projects.find(p => p.id === selectedProject)?.name || 'N/A'}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Client</Label>
                <p className="font-medium">{clientName || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Controls Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Timesheet Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="month">Month</Label>
                <Input
                  id="month"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>
              {projects.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="project">Project (Optional)</Label>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger id="project">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="client">Client Name (Optional)</Label>
                <Input
                  id="client"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Enter client name"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleGenerate}
                disabled={generating || !employeeId || !month}
                className="flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Generate Excel
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleSubmit}
                disabled={submitting || !employeeId || !month}
                className="flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit to Client
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Excel Preview/Edit Card */}
        {showPreview && editedData.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Timesheet Preview & Edit
                </CardTitle>
                <div className="flex gap-2">
                  <Button onClick={handleDownload} className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Download Excel
                  </Button>
                  <Button variant="outline" onClick={() => setShowPreview(false)}>
                    Close Preview
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    {editedData[0] && (
                      <TableRow>
                        {editedData[0].map((header: any, colIndex: number) => (
                          <TableHead key={colIndex} className="bg-muted sticky top-0 z-10">
                            {String(header || '')}
                          </TableHead>
                        ))}
                      </TableRow>
                    )}
                  </TableHeader>
                  <TableBody>
                    {editedData.slice(1).map((row: any[], rowIndex: number) => (
                      <TableRow key={rowIndex}>
                        {row.map((cell: any, colIndex: number) => {
                          const isEditing = editingCell?.row === rowIndex + 1 && editingCell?.col === colIndex;
                          const cellValue = String(cell || '');
                          const isHeaderRow = rowIndex === -1;
                          
                          // Skip editing header rows (first 6 rows are headers)
                          const canEdit = rowIndex >= 5;
                          
                          return (
                            <TableCell
                              key={colIndex}
                              className={!canEdit ? 'bg-muted/50' : ''}
                              onDoubleClick={() => canEdit && setEditingCell({ row: rowIndex + 1, col: colIndex })}
                            >
                              {isEditing ? (
                                <Input
                                  value={cellValue}
                                  onChange={(e) => handleCellEdit(rowIndex + 1, colIndex, e.target.value)}
                                  onBlur={() => setEditingCell(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      setEditingCell(null);
                                    }
                                  }}
                                  autoFocus
                                  className="h-8"
                                />
                              ) : (
                                <span className={canEdit ? 'cursor-pointer hover:bg-muted/50 px-2 py-1 rounded' : ''}>
                                  {cellValue}
                                </span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                💡 Double-click any cell in the data rows to edit. Click "Download Excel" to save your changes.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Summary Card */}
        {summary && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Timesheet Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Total Days</Label>
                  <p className="text-2xl font-bold">{summary.totalDays}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Billable Days</Label>
                  <p className="text-2xl font-bold text-green-600">{summary.billableDays}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Holidays</Label>
                  <p className="text-2xl font-bold text-amber-600">{summary.holidays}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Weekends</Label>
                  <p className="text-2xl font-bold text-gray-600">{summary.weekends}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

