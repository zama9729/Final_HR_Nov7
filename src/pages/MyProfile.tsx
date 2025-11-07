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
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  User, 
  Award, 
  Puzzle, 
  Briefcase,
  MapPin,
  Mail,
  Phone,
  Calendar,
  Building,
  Users,
  Edit,
  Save,
  X,
  Info,
  FileText,
  CreditCard,
  Home,
  UserCheck,
  Activity
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { format } from 'date-fns';

interface EmployeeData {
  id: string;
  employee_id: string;
  department: string;
  position: string;
  work_location: string;
  join_date: string;
  status: string;
  onboarding_status?: string;
  profiles?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  reporting_manager?: {
    id?: string;
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
}

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

export default function MyProfile() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState<string>('');
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    fetchMyProfile();
  }, []);

  const fetchMyProfile = async () => {
      try {
      setLoading(true);
        const me = await api.getEmployeeId();
        if (me?.id) {
          setEmployeeId(me.id);
        const emp = await api.getEmployee(me.id);
        setEmployee(emp);
        setFormData({
          firstName: emp?.profiles?.first_name || '',
          lastName: emp?.profiles?.last_name || '',
          email: emp?.profiles?.email || '',
          phone: emp?.profiles?.phone || '',
        });
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!employeeId) return;
    try {
      // Update profile information
      await api.updateProfile({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
      });
      
      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });
      
      setIsEditing(false);
      fetchMyProfile();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      });
    }
  };

  const getInitials = () => {
    const first = employee?.profiles?.first_name?.charAt(0) || '';
    const last = employee?.profiles?.last_name?.charAt(0) || '';
    return `${first}${last}`.toUpperCase();
  };

  const getFullName = () => {
    return `${employee?.profiles?.first_name || ''} ${employee?.profiles?.last_name || ''}`.trim() || 'Employee';
  };

  // Employees can edit their own profile (skills, certifications, past projects)
  // HR/CEO can view but not edit
  const canEditOwnProfile = userRole === 'employee' || userRole === 'manager';
  const canViewOnly = ['hr', 'ceo', 'director', 'admin'].includes(userRole || '');
  const isViewingAsManager = ['manager', 'hr', 'ceo', 'director', 'admin'].includes(userRole || '');
  
  // Calculate onboarding progress
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

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-7xl mx-auto">
          <div className="text-center py-12">Loading profile...</div>
        </div>
      </AppLayout>
    );
  }

  if (!employee) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-7xl mx-auto">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Profile not found</p>
          </div>
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
            <h1 className="text-3xl font-bold">My Profile</h1>
            <p className="text-muted-foreground">Manage your profile information, skills, certifications, and past projects</p>
          </div>
        </div>

        {/* Profile Header Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={undefined} />
                <AvatarFallback className="text-2xl">{getInitials()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">{getFullName()}</h2>
                    <p className="text-muted-foreground">{employee.position || 'Employee'}</p>
                  </div>
                  {canEditOwnProfile && !canViewOnly && (
                    <Button
                      variant={isEditing ? 'default' : 'outline'}
                      onClick={() => {
                        if (isEditing) {
                          setIsEditing(false);
                          setFormData({
                            firstName: employee?.profiles?.first_name || '',
                            lastName: employee?.profiles?.last_name || '',
                            email: employee?.profiles?.email || '',
                            phone: employee?.profiles?.phone || '',
                          });
                        } else {
                          setIsEditing(true);
                        }
                      }}
                    >
                      {isEditing ? (
                        <>
                          <X className="mr-2 h-4 w-4" />
                          Cancel
                        </>
                      ) : (
                        <>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Profile
                        </>
                      )}
                    </Button>
                  )}
                </div>
                
                {isEditing && canEditOwnProfile ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Button onClick={handleSave}>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{employee.profiles?.email || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{employee.profiles?.phone || 'N/A'}</span>
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
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="about" className="space-y-4">
          <TabsList>
            <TabsTrigger value="about">
              <Info className="mr-2 h-4 w-4" />
              About
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
                          {isViewingAsManager ? maskNumber(employee.onboarding_data.bank_account_number) : employee.onboarding_data.bank_account_number || 'N/A'}
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
                          {isViewingAsManager ? maskNumber(employee.onboarding_data.pan_number, 4) : employee.onboarding_data.pan_number || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Aadhar Number</Label>
                        <p className="font-medium">
                          {isViewingAsManager ? maskNumber(employee.onboarding_data.aadhar_number, 4) : employee.onboarding_data.aadhar_number || 'N/A'}
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
                            {isViewingAsManager ? maskNumber(employee.onboarding_data.emergency_contact_phone, 4) : employee.onboarding_data.emergency_contact_phone}
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
                        <div key={member.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
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
            {employeeId && (
              <EmployeeSkillsEditor 
                employeeId={employeeId} 
                canEdit={canEditOwnProfile && !canViewOnly} 
              />
            )}
          </TabsContent>

          <TabsContent value="certifications">
            {employeeId && (
              <EmployeeCertificationsEditor 
                employeeId={employeeId} 
                canEdit={canEditOwnProfile && !canViewOnly} 
              />
            )}
          </TabsContent>

          <TabsContent value="projects">
            {employeeId && (
              <EmployeePastProjectsEditor 
                employeeId={employeeId} 
                canEdit={canEditOwnProfile && !canViewOnly} 
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
