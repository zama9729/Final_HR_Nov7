import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import EmployeeSkillsEditor from '@/components/EmployeeSkillsEditor';
import EmployeeCertificationsEditor from '@/components/EmployeeCertificationsEditor';
import EmployeePastProjectsEditor from '@/components/EmployeePastProjectsEditor';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MapPin, 
  Mail, 
  Phone, 
  MoreVertical, 
  Pencil, 
  Save, 
  X,
  Calendar,
  Building,
  Users,
  Info,
  CreditCard,
  Home,
  Activity,
  Award,
  Puzzle,
  Briefcase,
  User,
  Clock,
  FileText,
  UserCheck,
  Eye,
  ArrowRight,
  Download
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { format, differenceInCalendarDays } from 'date-fns';
import { DocumentReviewPanel } from '@/components/hr/DocumentReviewPanel';
import { BackgroundCheckPanel } from '@/components/hr/BackgroundCheckPanel';
import { ProbationPanel } from '@/components/hr/ProbationPanel';
import { TeamReportingSection } from '@/components/TeamReportingSection';

// Helper component to display team members
function TeamMembersList({ teamId, employeeId }: { teamId: string; employeeId: string }) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const teamMembers = await api.getTeamMembers(teamId);
        // Filter out the current employee
        setMembers(teamMembers.filter((m: any) => m.employee_id !== employeeId));
      } catch (error) {
        console.error('Error fetching team members:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, [teamId, employeeId]);

  if (loading) {
    return <div className="text-sm text-muted-foreground py-2">Loading members...</div>;
  }

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No other team members</p>;
  }

  return (
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
      {members.map((member: any) => (
        <div
          key={member.id}
          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 hover-lift cursor-pointer"
          onClick={() => navigate(`/employees/${member.employee_id}`)}
        >
          <Avatar className="h-10 w-10">
            <AvatarFallback>
              {member.employee_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'E'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{member.employee_name}</p>
            <p className="text-sm text-muted-foreground truncate">
              {member.position || member.department || 'Employee'}
            </p>
            {member.employee_email && (
              <p className="text-xs text-muted-foreground truncate">{member.employee_email}</p>
            )}
            {member.role && (
              <Badge variant="outline" className="mt-1 text-xs">
                {member.role}
              </Badge>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

interface EmployeeData {
  id: string;
  employee_id: string;
  department: string;
  position: string;
  /**
   * Optional explicit designation/title for the employee.
   * Populated from employees.designation when available.
   */
  designation?: string;
  /**
   * Optional career grade / band for the employee.
   * Populated from employees.grade when available.
   */
  grade?: string;
  work_location: string;
  join_date: string;
  status: string;
  onboarding_status?: string;
  reporting_manager_id?: string;
  reporting_manager?: {
    id: string;
    first_name?: string;
    last_name?: string;
    position?: string;
  };
  reporting_team?: Array<{
    id: string;
    employee_id: string;
    position: string;
    department: string;
    profiles?: {
      first_name?: string;
      last_name?: string;
      email?: string;
    };
  }>;
  organization?: {
    name?: string;
    domain?: string;
  };
  onboarding_data?: {
    pan_number?: string;
    aadhar_number?: string;
    bank_account_number?: string;
    bank_name?: string;
    bank_branch?: string;
    ifsc_code?: string;
    permanent_address?: string;
    permanent_city?: string;
    permanent_state?: string;
    permanent_postal_code?: string;
    current_address?: string;
    current_city?: string;
    current_state?: string;
    current_postal_code?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    emergency_contact_relation?: string;
    completed_at?: string;
  };
  performance_reviews?: Array<{
    id: string;
    rating?: number;
    performance_score?: number;
    strengths?: string;
    areas_of_improvement?: string;
    goals?: string;
    comments?: string;
    status: string;
    created_at: string;
    appraisal_cycle?: {
      cycle_name?: string;
      cycle_year?: number;
      start_date?: string;
      end_date?: string;
    };
    reviewer?: {
      first_name?: string;
      last_name?: string;
      position?: string;
    };
  }>;
  profiles?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [myEmployeeId, setMyEmployeeId] = useState<string>('');
  const [defaultTab, setDefaultTab] = useState<string>('about');
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [teamMemberships, setTeamMemberships] = useState<any[]>([]);
  const [reportingLines, setReportingLines] = useState<any[]>([]);
  const [teamDetails, setTeamDetails] = useState<Record<string, any>>({});
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    employeeId: '',
    department: '',
    position: '',
    workLocation: '',
    joinDate: '',
    status: '',
    reportingManagerId: '',
  });
  const [managers, setManagers] = useState<Array<{ id: string; name: string }>>([]);
  const isHrUser = userRole ? ['hr', 'hrbp', 'hradmin', 'ceo', 'director', 'admin'].includes(userRole) : false;

  useEffect(() => {
    (async () => {
      try {
        const me = await api.getEmployeeId();
        setMyEmployeeId(me?.id || '');
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (id) {
      fetchEmployee();
      fetchManagers();
      fetchTeamData();
    }
  }, [id]);

  const fetchTeamData = async () => {
    if (!id) return;
    setTeamsLoading(true);
    try {
      // Fetch team memberships
      const teams = await api.getTeams();
      const allMemberships: any[] = [];
      const teamDetailsMap: Record<string, any> = {};
      
      for (const team of teams) {
        try {
          const members = await api.getTeamMembers(team.id);
          const employeeMemberships = members.filter((m: any) => m.employee_id === id && !m.end_date);
          
          if (employeeMemberships.length > 0) {
            teamDetailsMap[team.id] = team;
            for (const mem of employeeMemberships) {
              allMemberships.push({
                ...mem,
                team_id: team.id,
                team_name: team.name,
                team_code: team.code,
                team_type: team.team_type,
                team_description: team.description,
              });
            }
          }
        } catch (err) {
          // Team might not exist or no access
        }
      }
      
      setTeamMemberships(allMemberships);
      setTeamDetails(teamDetailsMap);
      
      // Fetch reporting lines
      const reporting = await api.getEmployeeReportingLines(id);
      setReportingLines(reporting);
    } catch (error: any) {
      console.error('Error fetching team data:', error);
    } finally {
      setTeamsLoading(false);
    }
  };

  const fetchEmployee = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await api.getEmployee(id);
      setEmployee(data);
      setFormData({
        firstName: data.profiles?.first_name || '',
        lastName: data.profiles?.last_name || '',
        email: data.profiles?.email || '',
        phone: data.profiles?.phone || '',
        employeeId: data.employee_id || '',
        department: data.department || '',
        position: data.position || '',
        workLocation: data.work_location || '',
        joinDate: data.join_date || '',
        status: data.status || 'active',
        reportingManagerId: data.reporting_manager_id || '',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load employee details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchManagers = async () => {
    try {
      const employees = await api.getEmployees();
      const managerList = employees
        .map((emp: any) => ({
          id: emp.id,
          name: `${emp.profiles?.first_name || ''} ${emp.profiles?.last_name || ''}`.trim(),
        }))
        .filter((mgr: any) => mgr.name);
      setManagers(managerList);
    } catch (error) {
      console.error('Error fetching managers:', error);
    }
  };

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'skills' || tab === 'certs' || tab === 'projects' || tab === 'about' || tab === 'job' || tab === 'docs' || tab === 'goals' || tab === 'reviews' || tab === 'onboarding' || tab === 'teams' || tab === 'timesheets') {
      setDefaultTab(tab);
    }
  }, [searchParams]);

  const canEdit = userRole && ['hr', 'ceo', 'director', 'admin'].includes(userRole);
  // Allow viewing: HR/CEO/Director can view anyone, Managers can view anyone (backend will enforce team restriction), Employees can view their own
  const canView = canEdit || userRole === 'manager' || (userRole === 'employee' && myEmployeeId && id === myEmployeeId);
  const isViewingOtherUser = myEmployeeId && id !== myEmployeeId;
  const isViewingAsManager = ['manager', 'hr', 'ceo', 'director', 'admin'].includes(userRole || '');

  // Utility function to mask sensitive numbers (show only last 4 digits)
  const maskNumber = (value: string | undefined | null, showLastDigits: number = 4): string => {
    if (!value) return 'N/A';
    const str = String(value);
    if (str.length <= showLastDigits) return str;
    const masked = '*'.repeat(str.length - showLastDigits);
    return masked + str.slice(-showLastDigits);
  };

  // Calculate onboarding progress
  const calculateOnboardingProgress = (onboardingData: any): number => {
    if (!onboardingData) return 0;
    
    const fields = [
      onboardingData.emergency_contact_name,
      onboardingData.emergency_contact_phone,
      onboardingData.permanent_address,
      onboardingData.permanent_city,
      onboardingData.permanent_state,
      onboardingData.permanent_postal_code,
      onboardingData.current_address,
      onboardingData.current_city,
      onboardingData.current_state,
      onboardingData.current_postal_code,
      onboardingData.bank_account_number,
      onboardingData.bank_name,
      onboardingData.bank_branch,
      onboardingData.ifsc_code,
      onboardingData.pan_number,
      onboardingData.aadhar_number,
    ];
    
    const filledFields = fields.filter(f => f && String(f).trim().length > 0).length;
    return Math.round((filledFields / fields.length) * 100);
  };

  const onboardingProgress = calculateOnboardingProgress(employee?.onboarding_data);
  const getOnboardingStatus = () => {
    if (!employee?.onboarding_status) return 'Not Started';
    switch (employee.onboarding_status) {
      case 'completed': return 'Completed';
      case 'in_progress': return 'In Progress';
      case 'not_started': return 'Not Started';
      default: return 'Pending';
    }
  };

  const handleSave = async () => {
    if (!id) return;
    try {
      await api.updateEmployee(id, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        employeeId: formData.employeeId,
        department: formData.department,
        position: formData.position,
        workLocation: formData.workLocation,
        joinDate: formData.joinDate,
        status: formData.status,
        reportingManagerId: formData.reportingManagerId || null,
      });
      
      toast({
        title: 'Success',
        description: 'Employee details updated successfully',
      });
      
      setIsEditing(false);
      fetchEmployee();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update employee',
        variant: 'destructive',
      });
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return `${first}${last}`.toUpperCase();
  };

  const getFullName = () => {
    return `${employee?.profiles?.first_name || ''} ${employee?.profiles?.last_name || ''}`.trim();
  };

  const getReportingManagerName = () => {
    if (!employee?.reporting_manager) return 'N/A';
    return `${employee.reporting_manager.first_name || ''} ${employee.reporting_manager.last_name || ''}`.trim();
  };

  const calculateWorkAnniversary = () => {
    if (!employee?.join_date) return null;
    const joinDate = new Date(employee.join_date);
    const today = new Date();
    const years = today.getFullYear() - joinDate.getFullYear();
    const monthDiff = today.getMonth() - joinDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < joinDate.getDate())) {
      return years - 1;
    }
    return years;
  };

  const anniversaryYears = calculateWorkAnniversary();

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-7xl mx-auto">
          <div className="text-center py-12">Loading employee details...</div>
        </div>
      </AppLayout>
    );
  }

  if (!employee) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-7xl mx-auto">
          <div className="text-center py-12 text-muted-foreground">Employee not found</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Employee Profile</h1>
            <p className="text-muted-foreground">View employee profile information, skills, certifications, and past projects</p>
          </div>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  Actions
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(!isEditing)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {isEditing ? 'Cancel Edit' : 'Edit Profile'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/timesheet-generator/${id}?month=${new Date().toISOString().slice(0, 7)}`)}>
                  <Download className="mr-2 h-4 w-4" />
                  Generate Timesheet
                </DropdownMenuItem>
                <DropdownMenuItem>Export Profile</DropdownMenuItem>
                <DropdownMenuItem>View Org Chart</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Profile Header Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={undefined} />
                <AvatarFallback className="text-2xl">
                  {getInitials(employee.profiles?.first_name, employee.profiles?.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">{getFullName()}</h2>
                    <p className="text-muted-foreground">
                      {employee.designation || employee.position || 'Employee'}
                    </p>
                    {employee.verified_at && (
                      <p className="text-xs text-sky-600 flex items-center gap-1 mt-1">
                        <UserCheck className="h-3 w-3" />
                        Verified on {format(new Date(employee.verified_at), 'MMM dd, yyyy')}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.profiles?.email || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {isViewingOtherUser && isViewingAsManager 
                        ? maskNumber(employee.profiles?.phone, 4) 
                        : employee.profiles?.phone || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.department || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.work_location || 'N/A'}</span>
                  </div>
                  {employee.join_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Joined {format(new Date(employee.join_date), 'MMM yyyy')}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant={employee.status === 'active' ? 'default' : 'secondary'}>
                      {employee.status || 'active'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={defaultTab} onValueChange={setDefaultTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="about">
              <Info className="mr-2 h-4 w-4" />
              About
            </TabsTrigger>
            <TabsTrigger value="teams">
              <Users className="mr-2 h-4 w-4" />
              Teams
            </TabsTrigger>
            <TabsTrigger value="skills">
              <Award className="mr-2 h-4 w-4" />
              Skills
            </TabsTrigger>
            <TabsTrigger value="certifications">
              <Puzzle className="mr-2 h-4 w-4" />
              Certifications
            </TabsTrigger>
            <TabsTrigger value="projects">
              <Briefcase className="mr-2 h-4 w-4" />
              Past Projects
            </TabsTrigger>
            <TabsTrigger value="timesheets">
              <Clock className="mr-2 h-4 w-4" />
              Timesheets
            </TabsTrigger>
            {isHrUser && (
              <>
                <TabsTrigger value="documents">
                  <FileText className="mr-2 h-4 w-4" />
                  Documents
                </TabsTrigger>
                <TabsTrigger value="background-check">
                  <UserCheck className="mr-2 h-4 w-4" />
                  Background Check
                </TabsTrigger>
                <TabsTrigger value="probation">
                  <Activity className="mr-2 h-4 w-4" />
                  Probation
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="about">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Personal Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Employee ID</Label>
                      <p className="font-medium">{employee.employee_id || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Department</Label>
                      <p className="font-medium">{employee.department || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Position</Label>
                      <p className="font-medium">{employee.position || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Designation</Label>
                      <p className="font-medium">{employee.designation || employee.position || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Grade</Label>
                      <p className="font-medium">{employee.grade || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Work Location</Label>
                      <p className="font-medium">{employee.work_location || 'N/A'}</p>
                    </div>
                    {employee.join_date && (
                      <div>
                        <Label className="text-muted-foreground">Join Date</Label>
                        <p className="font-medium">{format(new Date(employee.join_date), 'MMM dd, yyyy')}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <Badge variant={employee.status === 'active' ? 'default' : 'secondary'}>
                        {employee.status || 'active'}
                      </Badge>
                    </div>
                  </div>
                  
                  {employee.reporting_manager && (
                    <div className="pt-4 border-t">
                      <Label className="text-muted-foreground">Reporting Manager</Label>
                      <p className="font-medium">
                        {employee.reporting_manager.first_name} {employee.reporting_manager.last_name}
                        {employee.reporting_manager.position && ` - ${employee.reporting_manager.position}`}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Team & Reporting Section */}
              <TeamReportingSection employeeId={employee.id} />

              {/* Onboarding Progress */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Onboarding Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{getOnboardingStatus()}</span>
                      <span className="text-sm text-muted-foreground">{onboardingProgress}%</span>
                    </div>
                    <ProgressBar value={onboardingProgress} className="h-2" />
                  </div>
                  <Badge 
                    variant={
                      employee?.onboarding_status === 'completed' ? 'default' :
                      employee?.onboarding_status === 'in_progress' ? 'secondary' :
                      'outline'
                    }
                  >
                    {getOnboardingStatus()}
                  </Badge>
                  {employee?.onboarding_data?.completed_at && (
                    <p className="text-sm text-muted-foreground">
                      Completed on {format(new Date(employee.onboarding_data.completed_at), 'MMM dd, yyyy')}
                    </p>
                  )}
                </CardContent>
              </Card>

          {employee?.probation && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Probation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary">{employee.probation.status}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Ends</span>
                  <span className="font-medium">{format(new Date(employee.probation.probation_end), 'MMM dd, yyyy')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {differenceInCalendarDays(new Date(employee.probation.probation_end), new Date())} days remaining
                </p>
              </CardContent>
            </Card>
          )}

              {/* Financial Information */}
              {employee?.onboarding_data && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Financial Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Bank Account</Label>
                        <p className="font-medium">
                          {isViewingOtherUser && isViewingAsManager ? maskNumber(employee.onboarding_data.bank_account_number) : employee.onboarding_data.bank_account_number || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Bank Name</Label>
                        <p className="font-medium">{employee.onboarding_data.bank_name || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Bank Branch</Label>
                        <p className="font-medium">{employee.onboarding_data.bank_branch || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">IFSC Code</Label>
                        <p className="font-medium">{employee.onboarding_data.ifsc_code || 'N/A'}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">PAN Number</Label>
                        <p className="font-medium">
                          {isViewingOtherUser && isViewingAsManager ? maskNumber(employee.onboarding_data.pan_number, 4) : employee.onboarding_data.pan_number || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Aadhar Number</Label>
                        <p className="font-medium">
                          {isViewingOtherUser && isViewingAsManager ? maskNumber(employee.onboarding_data.aadhar_number, 4) : employee.onboarding_data.aadhar_number || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Address Information */}
              {employee?.onboarding_data && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Home className="h-5 w-5" />
                      Address Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-muted-foreground">Permanent Address</Label>
                      <p className="font-medium">
                        {employee.onboarding_data.permanent_address || 'N/A'}
                        {employee.onboarding_data.permanent_city && `, ${employee.onboarding_data.permanent_city}`}
                        {employee.onboarding_data.permanent_state && `, ${employee.onboarding_data.permanent_state}`}
                        {employee.onboarding_data.permanent_postal_code && ` - ${employee.onboarding_data.permanent_postal_code}`}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Current Address</Label>
                      <p className="font-medium">
                        {employee.onboarding_data.current_address || 'N/A'}
                        {employee.onboarding_data.current_city && `, ${employee.onboarding_data.current_city}`}
                        {employee.onboarding_data.current_state && `, ${employee.onboarding_data.current_state}`}
                        {employee.onboarding_data.current_postal_code && ` - ${employee.onboarding_data.current_postal_code}`}
                      </p>
                    </div>
                    {employee.onboarding_data.emergency_contact_name && (
                      <div className="pt-4 border-t">
                        <Label className="text-muted-foreground">Emergency Contact</Label>
                        <p className="font-medium">
                          {employee.onboarding_data.emergency_contact_name}
                          {employee.onboarding_data.emergency_contact_relation && ` (${employee.onboarding_data.emergency_contact_relation})`}
                        </p>
                        {employee.onboarding_data.emergency_contact_phone && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {isViewingOtherUser && isViewingAsManager ? maskNumber(employee.onboarding_data.emergency_contact_phone, 4) : employee.onboarding_data.emergency_contact_phone}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Reporting Team */}
              {employee?.reporting_team && employee.reporting_team.length > 0 && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Reporting Team ({employee.reporting_team.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {employee.reporting_team.map((member) => (
                        <div key={member.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 hover-lift transition-colors">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {member.profiles?.first_name?.charAt(0) || ''}{member.profiles?.last_name?.charAt(0) || ''}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {member.profiles?.first_name} {member.profiles?.last_name}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {member.position || member.department || 'Employee'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="skills">
            {id && canView && (
              <EmployeeSkillsEditor 
                employeeId={id} 
                canEdit={false} 
              />
            )}
          </TabsContent>

          <TabsContent value="certifications">
            {id && canView && (
              <EmployeeCertificationsEditor 
                employeeId={id} 
                canEdit={false} 
              />
            )}
          </TabsContent>

          <TabsContent value="projects">
            {id && canView && (
              <EmployeePastProjectsEditor 
                employeeId={id} 
                canEdit={false} 
              />
            )}
          </TabsContent>

          <TabsContent value="timesheets">
            {id && canView && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Timesheets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      View and manage timesheets for {employee?.profiles?.first_name} {employee?.profiles?.last_name}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => window.open(`/timesheets?employee=${id}`, '_blank')}
                        variant="default"
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        View Employee Timesheets
                      </Button>
                      {isHrUser && (
                        <Button 
                          onClick={() => window.open('/timesheet-approvals', '_blank')}
                          variant="outline"
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          View All Approvals
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="teams">
            {id && canView && (
              <div className="space-y-6">
                {/* Teams the Employee Belongs To */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="h-5 w-5" />
                      Teams ({teamMemberships.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {teamsLoading ? (
                      <div className="text-center py-4 text-muted-foreground">Loading teams...</div>
                    ) : teamMemberships.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        This employee is not part of any teams
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {teamMemberships.map((membership) => {
                          const team = teamDetails[membership.team_id];
                          return (
                            <div key={membership.id} className="border rounded-lg p-4 space-y-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h3 className="font-semibold text-lg">{membership.team_name}</h3>
                                    <Badge variant={membership.is_primary ? 'default' : 'secondary'}>
                                      {membership.is_primary ? 'Primary' : 'Secondary'}
                                    </Badge>
                                    <Badge variant="outline">{membership.team_type}</Badge>
                                    <Badge variant="outline">{membership.role}</Badge>
                                  </div>
                                  {membership.team_code && (
                                    <p className="text-sm text-muted-foreground mb-2">
                                      Code: {membership.team_code}
                                    </p>
                                  )}
                                  {membership.team_description && (
                                    <p className="text-sm text-muted-foreground mb-2">
                                      {membership.team_description}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground">
                                    Member since {format(new Date(membership.start_date), 'MMM dd, yyyy')}
                                  </p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/teams/${membership.team_id}`)}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Team
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Reporting Manager */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Reporting Manager
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {teamsLoading ? (
                      <div className="text-center py-4 text-muted-foreground">Loading...</div>
                    ) : (
                      <div className="space-y-3">
                        {reportingLines
                          .filter((rl) => rl.relationship_type === 'PRIMARY_MANAGER' && !rl.end_date)
                          .map((manager) => (
                            <div key={manager.id} className="flex items-center gap-3 p-3 border rounded-lg">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback>
                                  {manager.manager_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'M'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <p className="font-medium">{manager.manager_name}</p>
                                {manager.manager_email && (
                                  <p className="text-sm text-muted-foreground">{manager.manager_email}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  Primary Manager
                                  {manager.start_date && ` • Since ${format(new Date(manager.start_date), 'MMM dd, yyyy')}`}
                                </p>
                              </div>
                              {manager.manager_id && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/employees/${manager.manager_id}`)}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Profile
                                </Button>
                              )}
                            </div>
                          ))}
                        {reportingLines.filter((rl) => rl.relationship_type === 'PRIMARY_MANAGER' && !rl.end_date).length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No reporting manager assigned
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Team Members (if employee manages any teams) */}
                {teamMemberships.some((tm) => ['MANAGER', 'LEAD'].includes(tm.role)) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Team Members
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {teamsLoading ? (
                        <div className="text-center py-4 text-muted-foreground">Loading team members...</div>
                      ) : (
                        <div className="space-y-4">
                          {Object.values(teamDetails).map((team: any) => {
                            const membership = teamMemberships.find((tm) => tm.team_id === team.id);
                            if (!membership || !['MANAGER', 'LEAD'].includes(membership.role)) return null;
                            
                            return (
                              <div key={team.id} className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Building className="h-4 w-4 text-muted-foreground" />
                                  <h4 className="font-medium">{team.name}</h4>
                                  <Badge variant="outline">{membership.role}</Badge>
                                </div>
                                <TeamMembersList teamId={team.id} employeeId={id!} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {isHrUser && employee?.id && (
            <>
              <TabsContent value="documents">
                <DocumentReviewPanel employeeId={employee.id} />
              </TabsContent>
              <TabsContent value="background-check">
                {employee?.id && <BackgroundCheckPanel employeeId={employee.id} />}
              </TabsContent>
              <TabsContent value="probation">
                <ProbationPanel employeeId={employee.id} canEdit={isHrUser} />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}