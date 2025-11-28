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
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  Activity,
  Clock,
  CalendarDays,
  CheckCircle2,
  Camera
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress as ProgressBar } from '@/components/ui/progress';
import { format, parseISO, isToday, isTomorrow, addDays, differenceInCalendarDays } from 'date-fns';
import { MissingDataAlert } from '@/components/onboarding/MissingDataAlert';
import { OnboardingStatusStepper } from '@/components/onboarding/OnboardingStatusStepper';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
    profile_picture_url?: string;
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
    passport_number?: string;
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
    // New extended fields
    full_legal_name?: string;
    date_of_birth?: string;
    gender?: string;
    nationality?: string;
    personal_phone?: string;
    personal_email?: string;
    government_ids?: any;
    tax_regime?: string;
    dependents?: any[];
    references?: any[];
    uan_number?: string;
    biometric_registration_status?: string;
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
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('about');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [upcomingShifts, setUpcomingShifts] = useState<any[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [onboardingProgress, setOnboardingProgress] = useState<any>(null);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [uploadingProfilePic, setUploadingProfilePic] = useState(false);
  const [missingData, setMissingData] = useState<any>(null);
  const [dismissedAlert, setDismissedAlert] = useState(false);
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [bankForm, setBankForm] = useState({
    bankAccountNumber: '',
    bankName: '',
    bankBranch: '',
    ifscCode: '',
  });
  const [savingBank, setSavingBank] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  const tabParam = useMemo(() => {
    return new URLSearchParams(location.search).get('tab');
  }, [location.search]);

  const employeeParam = useMemo(() => {
    return new URLSearchParams(location.search).get('employee');
  }, [location.search]);
  const isOwnProfile = !employeeParam;

  useEffect(() => {
    setActiveTab(tabParam || 'about');
  }, [tabParam]);

  useEffect(() => {
    if (employeeParam) {
      fetchEmployeeProfile(employeeParam);
    } else {
      fetchMyProfile();
    }
  }, [employeeParam]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(location.search);
    params.set('tab', value);
    window.history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  };

  useEffect(() => {
    if (employeeId) {
      fetchUpcomingShifts(employeeId);
      fetchOnboardingProgress();
      fetchMissingData();
    } else {
      setUpcomingShifts([]);
      setOnboardingProgress(null);
      setMissingData(null);
    }
  }, [employeeId]);

  const fetchMissingData = async () => {
    // Only check for own profile (not when viewing someone else's profile)
    if (!isOwnProfile) return;
    
    try {
      setLoadingProgress(true);
      const data = await api.getMissingOnboardingData();
      setMissingData(data);
    } catch (error: any) {
      console.error('Error fetching missing data:', error);
      // Don't show error toast for this, it's not critical
    } finally {
      setLoadingProgress(false);
    }
  };

  const handleProfilePictureUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file (JPG, PNG)',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: 'File too large',
        description: 'Profile picture must be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    setUploadingProfilePic(true);
    try {
      // Step 1: Get presigned URL
      const { url, key } = await api.getProfilePicturePresignedUrl(file.type);

      // Step 2: Upload file directly to MinIO/S3
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 3: Complete upload (save URL to database)
      const result = await api.uploadProfilePicture(url, key);

      // Update local state
      if (employee) {
        setEmployee({
          ...employee,
          profiles: {
            ...employee.profiles,
            profile_picture_url: result.profile_picture_url,
          },
        });
      }

      toast({
        title: 'Success',
        description: 'Profile picture uploaded successfully',
      });
    } catch (error: any) {
      console.error('Error uploading profile picture:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload profile picture',
        variant: 'destructive',
      });
    } finally {
      setUploadingProfilePic(false);
    }
  };

  const fetchOnboardingProgress = async () => {
    try {
      setLoadingProgress(true);
      const progress = await api.getOnboardingProgress();
      setOnboardingProgress(progress);
    } catch (error: any) {
      console.error('Error fetching onboarding progress:', error);
      // Don't show error if employee doesn't have onboarding data yet
    } finally {
      setLoadingProgress(false);
    }
  };

  const fetchUpcomingShifts = async (targetEmployeeId: string) => {
    if (!targetEmployeeId) return;
    
    try {
      setLoadingShifts(true);
      const today = new Date();
      const nextMonth = addDays(today, 30);
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/scheduling/employee/${targetEmployeeId}/shifts?start_date=${format(today, 'yyyy-MM-dd')}&end_date=${format(nextMonth, 'yyyy-MM-dd')}`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setUpcomingShifts(data.shifts || []);
      }
    } catch (error) {
      console.error('Error fetching upcoming shifts:', error);
    } finally {
      setLoadingShifts(false);
    }
  };

  const formatShiftTime = (time?: string | null) => {
    if (!time) return '--';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getShiftDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d, yyyy');
  };

  const loadEmployeeProfile = async (id: string) => {
    const emp = await api.getEmployee(id);
    setEmployeeId(id);
    setEmployee(emp);
    setFormData({
      firstName: emp?.profiles?.first_name || '',
      lastName: emp?.profiles?.last_name || '',
      email: emp?.profiles?.email || '',
      phone: emp?.profiles?.phone || '',
    });
    setIsEditing(false);
  };

  const fetchEmployeeProfile = async (id: string) => {
    try {
      setLoading(true);
      await loadEmployeeProfile(id);
    } catch (error: any) {
      console.error('Error loading employee profile:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load employee profile',
        variant: 'destructive',
      });
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  };

  const handleManageBankDetails = () => {
    if (!employee) return;
    setBankForm({
      bankAccountNumber: employee.onboarding_data?.bank_account_number || '',
      bankName: employee.onboarding_data?.bank_name || '',
      bankBranch: employee.onboarding_data?.bank_branch || '',
      ifscCode: employee.onboarding_data?.ifsc_code || '',
    });
    setBankDialogOpen(true);
  };

  const handleSaveBankDetails = async () => {
    if (!employeeId) {
      toast({
        title: 'Unable to update',
        description: 'Employee record is missing.',
        variant: 'destructive',
      });
      return;
    }

    if (!bankForm.bankAccountNumber || !bankForm.bankName || !bankForm.bankBranch || !bankForm.ifscCode) {
      toast({
        title: 'Missing information',
        description: 'Please fill all bank fields before saving.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSavingBank(true);
      await api.updateBankDetails(employeeId, {
        bankAccountNumber: bankForm.bankAccountNumber.trim(),
        bankName: bankForm.bankName.trim(),
        bankBranch: bankForm.bankBranch.trim(),
        ifscCode: bankForm.ifscCode.trim(),
      });

      if (employee) {
        setEmployee({
          ...employee,
          onboarding_data: {
            ...employee.onboarding_data,
            bank_account_number: bankForm.bankAccountNumber.trim(),
            bank_name: bankForm.bankName.trim(),
            bank_branch: bankForm.bankBranch.trim(),
            ifsc_code: bankForm.ifscCode.trim(),
          },
        });
      }

      setBankDialogOpen(false);
      toast({
        title: 'Bank details updated',
        description: 'Your salary payment information has been saved.',
      });
      fetchMissingData();
      fetchOnboardingProgress();
    } catch (error: any) {
      console.error('Error saving bank details:', error);
      toast({
        title: 'Failed to save',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingBank(false);
    }
  };

  const fetchMyProfile = async () => {
    try {
      setLoading(true);
      
      // Try to get employee ID, but don't fail if it doesn't exist
      let me = null;
      try {
        me = await api.getEmployeeId();
      } catch (error: any) {
        // Employee record doesn't exist yet - this is OK for new signups
        console.log('No employee record found, using profile data:', error.message);
      }
      
      if (me?.id) {
        await loadEmployeeProfile(me.id);
        return;
      }

      // Fallback to base profile if no employee record exists
      const profile = await api.getProfile();
      if (profile) {
        setEmployeeId('');
        const fallbackEmployee: EmployeeData = {
          id: profile.id || 'profile',
          employee_id: profile.employee_code || profile.employee_id || 'N/A',
          department: profile.department || 'N/A',
          position: profile.position || profile.job_title || 'N/A',
          work_location: profile.work_location || profile.location || profile.timezone || 'N/A',
          join_date: profile.created_at || new Date().toISOString(),
          status: profile.status || 'active',
          onboarding_status: profile.onboarding_status || 'not_started',
          reporting_manager: undefined,
          reporting_team: [],
          onboarding_data: {},
          profiles: {
            first_name: profile.first_name,
            last_name: profile.last_name,
            email: profile.email,
            phone: profile.phone,
          },
        };
        setEmployee(fallbackEmployee);
        setFormData({
          firstName: profile.first_name || '',
          lastName: profile.last_name || '',
          email: profile.email || '',
          phone: profile.phone || '',
        });
        setIsEditing(false);
      } else {
        setEmployee(null);
        toast({
          title: 'Profile not found',
          description: 'Please contact your administrator to set up your profile.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load profile',
        variant: 'destructive',
      });
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isViewingOwnProfile) return;
    try {
      await api.submitProfileChangeRequest({
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone,
      });

      toast({
        title: 'Request submitted',
        description: 'Your profile update is pending HR approval.',
      });

      setIsEditing(false);
      if (employeeParam) {
        fetchEmployeeProfile(employeeParam);
      } else {
        fetchMyProfile();
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit profile change request',
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

  const isViewingOtherProfile = Boolean(employeeParam);
  const isViewingOwnProfile = !isViewingOtherProfile;

  // Employees can edit their own profile (skills, certifications, past projects)
  // HR/CEO can view but not edit
  const canEditOwnProfile = isViewingOwnProfile && (userRole === 'employee' || userRole === 'manager');
  const canViewOnly = ['hr', 'ceo', 'director', 'admin'].includes(userRole || '');
  const isViewingAsManager = ['manager', 'hr', 'ceo', 'director', 'admin'].includes(userRole || '');
  
  // Calculate onboarding progress (for About tab - simple percentage)
  const calculatedProgress = calculateOnboardingProgress(employee?.onboarding_data);
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
              <div className="relative group">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={employee?.profiles?.profile_picture_url} />
                  <AvatarFallback className="text-2xl">{getInitials()}</AvatarFallback>
                </Avatar>
                {canEditOwnProfile && !canViewOnly && (
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 rounded-full cursor-pointer transition-opacity">
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleProfilePictureUpload(file);
                        }
                      }}
                      disabled={uploadingProfilePic}
                    />
                    {uploadingProfilePic ? (
                      <div className="text-white text-sm">Uploading...</div>
                    ) : (
                      <Camera className="h-6 w-6 text-white" />
                    )}
                  </label>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">{getFullName()}</h2>
                    <p className="text-muted-foreground">{employee.position || 'Employee'}</p>
                    {employee.verified_at && (
                      <p className="text-xs text-sky-600 flex items-center gap-1 mt-1">
                        <UserCheck className="h-3 w-3" />
                        Verified on {format(new Date(employee.verified_at), 'MMM dd, yyyy')}
                      </p>
                    )}
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

        {/* Missing Data Alert */}
        {isViewingOwnProfile && missingData?.has_missing_data && !dismissedAlert && (
          <MissingDataAlert
            missingFields={missingData.missing_fields || []}
            missingDocuments={missingData.missing_documents || []}
            hasMissingData={missingData.has_missing_data}
            message={missingData.message}
            onDismiss={() => setDismissedAlert(true)}
          />
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
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
            <TabsTrigger value="shifts" disabled={!employeeId}>
              <CalendarDays className="mr-2 h-4 w-4" />
              My Shifts
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
                      <span className="text-sm text-muted-foreground">{calculatedProgress}%</span>
                    </div>
                    <ProgressBar value={calculatedProgress} className="h-2" />
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
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Financial Information
                      </CardTitle>
                      {isOwnProfile && (
                        <Button size="sm" variant="outline" onClick={handleManageBankDetails}>
                          {employee.onboarding_data.bank_account_number ? 'Edit Bank Details' : 'Add Bank Details'}
                        </Button>
                      )}
                    </div>
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

              {/* Extended Onboarding Information */}
              {(employee.onboarding_data?.full_legal_name || 
                employee.onboarding_data?.date_of_birth || 
                employee.onboarding_data?.nationality || 
                employee.onboarding_data?.personal_phone || 
                employee.onboarding_data?.personal_email ||
                employee.onboarding_data?.gender ||
                employee.onboarding_data?.uan_number ||
                employee.onboarding_data?.passport_number) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5" />
                      Extended Personal Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {employee.onboarding_data.full_legal_name && (
                        <div>
                          <Label className="text-muted-foreground">Full Legal Name</Label>
                          <p className="font-medium">{employee.onboarding_data.full_legal_name}</p>
                        </div>
                      )}
                      {employee.onboarding_data.date_of_birth && (
                        <div>
                          <Label className="text-muted-foreground">Date of Birth</Label>
                          <p className="font-medium">{format(new Date(employee.onboarding_data.date_of_birth), 'MMM dd, yyyy')}</p>
                        </div>
                      )}
                      {employee.onboarding_data.nationality && (
                        <div>
                          <Label className="text-muted-foreground">Nationality</Label>
                          <p className="font-medium">{employee.onboarding_data.nationality}</p>
                        </div>
                      )}
                      {employee.onboarding_data.gender && (
                        <div>
                          <Label className="text-muted-foreground">Gender</Label>
                          <p className="font-medium capitalize">{employee.onboarding_data.gender.replace('_', ' ')}</p>
                        </div>
                      )}
                      {employee.onboarding_data.personal_phone && (
                        <div>
                          <Label className="text-muted-foreground">Personal Phone</Label>
                          <p className="font-medium">
                            {isViewingAsManager ? maskNumber(employee.onboarding_data.personal_phone, 4) : employee.onboarding_data.personal_phone}
                          </p>
                        </div>
                      )}
                      {employee.onboarding_data.personal_email && (
                        <div>
                          <Label className="text-muted-foreground">Personal Email</Label>
                          <p className="font-medium">{employee.onboarding_data.personal_email}</p>
                        </div>
                      )}
                      {employee.onboarding_data.uan_number && (
                        <div>
                          <Label className="text-muted-foreground">UAN Number</Label>
                          <p className="font-medium">
                            {isViewingAsManager ? maskNumber(employee.onboarding_data.uan_number, 4) : employee.onboarding_data.uan_number}
                          </p>
                        </div>
                      )}
                      {employee.onboarding_data.passport_number && (
                        <div>
                          <Label className="text-muted-foreground">Passport Number</Label>
                          <p className="font-medium">
                            {isViewingAsManager ? maskNumber(employee.onboarding_data.passport_number, 4) : employee.onboarding_data.passport_number}
                          </p>
                        </div>
                      )}
                    </div>
                    {employee.onboarding_data.tax_regime && (
                      <div className="pt-4 border-t">
                        <Label className="text-muted-foreground">Tax Regime</Label>
                        <p className="font-medium capitalize">{employee.onboarding_data.tax_regime}</p>
                      </div>
                    )}
                    {employee.onboarding_data.dependents && Array.isArray(employee.onboarding_data.dependents) && employee.onboarding_data.dependents.length > 0 && (
                      <div className="pt-4 border-t">
                        <Label className="text-muted-foreground mb-2 block">Dependents</Label>
                        <div className="space-y-2">
                          {employee.onboarding_data.dependents.map((dep: any, idx: number) => (
                            <div key={idx} className="p-2 border rounded">
                              <p className="font-medium">{dep.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {dep.relation} {dep.date_of_birth && `• DOB: ${format(new Date(dep.date_of_birth), 'MMM dd, yyyy')}`}
                              </p>
                            </div>
                          ))}
                        </div>
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

          <TabsContent value="shifts">
            {employeeId ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    My Scheduled Shifts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingShifts ? (
                    <div className="text-center py-8 text-muted-foreground">Loading shifts...</div>
                  ) : upcomingShifts.length > 0 ? (
                    <div className="space-y-3">
                      {upcomingShifts.map((shift) => {
                        const shiftDate = parseISO(shift.shift_date);
                        const isShiftToday = isToday(shiftDate);
                        const isShiftTomorrow = isTomorrow(shiftDate);
                        
                        return (
                          <div
                            key={shift.id}
                            className={`p-4 rounded-lg border transition-colors ${
                              isShiftToday 
                                ? 'bg-blue-50 dark:bg-blue-950 border-blue-200' 
                                : isShiftTomorrow 
                                ? 'bg-amber-50 dark:bg-amber-950 border-amber-200' 
                                : 'bg-muted/30 border-border'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-semibold">{shift.template_name}</p>
                                  <Badge 
                                    variant={
                                      shift.shift_type === 'night' ? 'destructive' :
                                      shift.shift_type === 'evening' ? 'secondary' : 'default'
                                    }
                                    className="text-xs"
                                  >
                                    {shift.shift_type?.charAt(0).toUpperCase() + shift.shift_type?.slice(1) || 'Day'} Shift
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {getShiftDateLabel(shift.shift_date)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mt-3 text-sm">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">
                                  {formatShiftTime(shift.start_time)} - {formatShiftTime(shift.end_time)}
                                </span>
                              </div>
                              {shift.assigned_by && (
                                <div className="text-xs text-muted-foreground">
                                  Assigned by: {shift.assigned_by === 'algorithm' ? 'System' : 'Manager'}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No shifts scheduled for the next 30 days</p>
                      <p className="text-xs mt-1">Contact your manager or HR for shift assignments</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Shifts are available only for employees with active records. Please contact HR if you need access.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="onboarding-progress">
            {employeeId ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Onboarding Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingProgress ? (
                    <div className="text-center py-8 text-muted-foreground">Loading progress...</div>
                  ) : onboardingProgress ? (
                    <div className="space-y-6">
                      {/* Progress Bar */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Overall Progress</span>
                          <span className="text-sm text-muted-foreground">{onboardingProgress.progress_percentage}%</span>
                        </div>
                        <ProgressBar value={onboardingProgress.progress_percentage} className="h-3" />
                      </div>

                      <OnboardingStatusStepper
                        currentStatus={onboardingProgress.current_status}
                        completedSteps={(onboardingProgress.steps_completed || []).map((step: any) => step.step)}
                      />

                      {/* Current Status */}
                      <div className="p-4 border rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">Current Status</p>
                        <p className="text-lg font-semibold">
                          {onboardingProgress.current_status?.replace(/_/g, ' ') || 'Not Started'}
                        </p>
                        {onboardingProgress.next_step && (
                          <p className="text-sm text-muted-foreground mt-2">
                            Next: {onboardingProgress.next_step.replace(/_/g, ' ')}
                          </p>
                        )}
                      </div>

                      {/* Background Check Status */}
                      {onboardingProgress.background_check_status && (
                        <div className="p-4 border rounded-lg">
                          <p className="text-sm text-muted-foreground mb-1">Background Check</p>
                          <Badge 
                            variant={
                              onboardingProgress.background_check_status === 'COMPLETED' ? 'default' :
                              onboardingProgress.background_check_status === 'ON_HOLD' ? 'secondary' :
                              'outline'
                            }
                          >
                            {onboardingProgress.background_check_status.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      )}

                      {/* Steps History */}
                      {onboardingProgress.steps_completed && onboardingProgress.steps_completed.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-3">Completed Steps</p>
                          <div className="space-y-2">
                            {onboardingProgress.steps_completed.map((step: any, index: number) => (
                              <div key={index} className="flex items-center gap-3 p-2 border rounded">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{step.step.replace(/_/g, ' ')}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(step.occurred_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No onboarding progress found</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Onboarding progress is available only for employees with active records.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bank Details</DialogTitle>
          <DialogDescription>Provide accurate salary payout information.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="bankAccountNumberDialog">Account Number *</Label>
            <Input
              id="bankAccountNumberDialog"
              value={bankForm.bankAccountNumber}
              onChange={(e) => setBankForm((prev) => ({ ...prev, bankAccountNumber: e.target.value }))}
              placeholder="Enter account number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankNameDialog">Bank Name *</Label>
            <Input
              id="bankNameDialog"
              value={bankForm.bankName}
              onChange={(e) => setBankForm((prev) => ({ ...prev, bankName: e.target.value }))}
              placeholder="e.g., ICICI Bank"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankBranchDialog">Branch *</Label>
            <Input
              id="bankBranchDialog"
              value={bankForm.bankBranch}
              onChange={(e) => setBankForm((prev) => ({ ...prev, bankBranch: e.target.value }))}
              placeholder="Branch name or code"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ifscDialog">IFSC Code *</Label>
            <Input
              id="ifscDialog"
              value={bankForm.ifscCode}
              onChange={(e) => setBankForm((prev) => ({ ...prev, ifscCode: e.target.value.toUpperCase() }))}
              placeholder="e.g., ICIC0001234"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setBankDialogOpen(false)} disabled={savingBank}>
            Cancel
          </Button>
          <Button onClick={handleSaveBankDetails} disabled={savingBank}>
            {savingBank ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </AppLayout>
  );
}
