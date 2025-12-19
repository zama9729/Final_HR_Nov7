import { useEffect, useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfilePicture } from '@/components/ProfilePicture';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import EmployeeSkillsEditor from '@/components/EmployeeSkillsEditor';
import EmployeePastProjectsEditor from '@/components/EmployeePastProjectsEditor';
import EmployeeCertificationsEditor from '@/components/EmployeeCertificationsEditor';
import AnimatedHistoryTimeline from '@/components/AnimatedHistoryTimeline';
import { CalendarDays, Clock, Camera, Upload, Download, Mail, Phone, MapPin, Briefcase, Award, Code, Calendar, UserPlus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, format, isToday, isTomorrow, parseISO } from 'date-fns';

interface SimpleEmployee {
  id: string;
  employee_id?: string;
  department?: string;
  position?: string;
  grade?: string;
  designation?: string;
  work_location?: string;
  join_date?: string;
  status?: string;
  profiles?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    profile_picture_url?: string;
  };
  reporting_team?: Array<{
    id: string;
    employee_id: string;
    position?: string;
    department?: string;
    profiles?: {
      first_name?: string;
      last_name?: string;
    };
    status?: 'In' | 'Leave' | 'WFH';
  }>;
}

interface HistoryEvent {
  id: string;
  event_type: string;
  event_date: string;
  title: string;
  description?: string;
  metadata_json: any;
}

export default function MyProfile() {
  const { userRole, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [employee, setEmployee] = useState<SimpleEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [about, setAbout] = useState('');
  const [jobLove, setJobLove] = useState('');
  const [hobbies, setHobbies] = useState('');
  const [aboutLoading, setAboutLoading] = useState(false);
  const [aboutEditing, setAboutEditing] = useState(false);
  const [aboutSaving, setAboutSaving] = useState(false);
  const [upcomingShifts, setUpcomingShifts] = useState<any[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [uploadingProfilePic, setUploadingProfilePic] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [directReports, setDirectReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If old URL /my/profile?tab=shifts is used, redirect to the new My Shifts page
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'shifts') {
      navigate('/my/shifts', { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        let me: { id: string } | null = null;
        try {
          me = await api.getEmployeeId();
        } catch {
          me = null;
        }

        if (me?.id) {
          const emp = await api.getEmployee(me.id);
          setEmployee(emp as SimpleEmployee);
        } else {
          const profile = await api.getProfile();
          setEmployee({
            id: profile.id,
            employee_id: profile.employee_code || profile.employee_id,
            department: profile.department,
            position: profile.position || profile.job_title,
            designation: profile.position || profile.job_title,
            work_location: profile.work_location || profile.location,
            join_date: profile.created_at,
            status: profile.status || 'active',
            profiles: {
              first_name: profile.first_name,
              last_name: profile.last_name,
              email: profile.email,
              phone: profile.phone,
              profile_picture_url: profile.profile_picture_url,
            },
          });
        }
      } catch (error: any) {
        console.error('Failed to load profile', error);
        toast({
          title: 'Unable to load profile',
          description: error?.message || 'Please try again later',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [toast]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!employee?.id) {
        console.log('[MyProfile] No employee ID, skipping history fetch');
        return;
      }
      try {
        setLoadingHistory(true);
        console.log('[MyProfile] Fetching history for employee:', employee.id);
        const data = await api.getMyHistory();
        console.log('[MyProfile] History API response:', data);
        
        // Handle both { events: [] } and direct array formats
        let events: HistoryEvent[] = [];
        if (Array.isArray(data)) {
          events = data;
        } else if (data?.events && Array.isArray(data.events)) {
          events = data.events;
        } else {
          events = [];
        }
        
        // If no events found but employee has join_date, try to ensure joining event exists
        if (events.length === 0 && employee.join_date) {
          try {
            // Try to create joining event on backend
            await api.post('/api/me/history/ensure-joining');
            // Refetch history after ensuring joining event
            const refreshedData = await api.getMyHistory();
            if (refreshedData?.events && Array.isArray(refreshedData.events)) {
              events = refreshedData.events;
            }
          } catch (ensureError) {
            console.warn('[MyProfile] Failed to ensure joining event:', ensureError);
            // Fallback: create joining event locally
            events = [{
              id: `joining-${employee.id}`,
              event_type: 'JOINING',
              event_date: employee.join_date,
              title: 'Joined Organization',
              description: 'Employee joined the organization',
              metadata_json: { joinDate: employee.join_date },
              source_table: null,
              source_id: null,
              created_at: employee.join_date,
            }];
          }
        }
        
        console.log('[MyProfile] Parsed history events:', events.length, events);
        setHistoryEvents(events);
      } catch (error: any) {
        console.error('[MyProfile] Error fetching history:', error);
        console.error('[MyProfile] Error details:', error?.message, error?.response);
        
        // Fallback: create joining event from join_date if available
        if (employee?.join_date) {
          const joinDate = new Date(employee.join_date);
          setHistoryEvents([{
            id: `joining-${employee.id}`,
            event_type: 'JOINING',
            event_date: employee.join_date,
            title: 'Joined Organization',
            description: 'Employee joined the organization',
            metadata_json: { joinDate: employee.join_date },
            source_table: null,
            source_id: null,
            created_at: employee.join_date,
          }]);
        } else {
          setHistoryEvents([]);
        }
      } finally {
        setLoadingHistory(false);
      }
    };

    const fetchDirectReports = async () => {
      if (!employee?.id) return;
      try {
        setLoadingReports(true);
        // Try to get direct reports using the reporting lines API
        const data = await api.getManagerDirectReports(employee.id);
        if (data?.direct_reports) {
          setDirectReports(data.direct_reports);
        } else if (employee.reporting_team) {
          setDirectReports(employee.reporting_team);
        } else {
          setDirectReports([]);
        }
      } catch (error) {
        console.error('Error fetching direct reports:', error);
        // Fallback to reporting_team from employee data
        if (employee.reporting_team) {
          setDirectReports(employee.reporting_team);
        } else {
          setDirectReports([]);
        }
      } finally {
        setLoadingReports(false);
      }
    };

    if (employee?.id) {
      fetchHistory();
      fetchDirectReports();
    }
  }, [employee?.id]);

  const fullName =
    `${employee?.profiles?.first_name || ''} ${employee?.profiles?.last_name || ''}`.trim() ||
    'Employee';

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U';

  const canEdit = ['employee', 'manager', 'hr', 'ceo', 'admin', 'director'].includes(userRole || '');

  const formatShiftTime = (time?: string | null) => {
    if (!time) return '--';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const calculateExperience = (joinDate?: string | null) => {
    if (!joinDate) return null;
    try {
      const join = new Date(joinDate);
      const now = new Date();
      
      let years = now.getFullYear() - join.getFullYear();
      let months = now.getMonth() - join.getMonth();
      
      // Adjust if current month is before join month
      if (months < 0) {
        years--;
        months += 12;
      }
      
      // Adjust if current day is before join day
      if (months === 0 && now.getDate() < join.getDate()) {
        if (years > 0) {
          years--;
          months = 11;
        }
      }
      
      if (years === 0 && months === 0) {
        // Less than a month
        const days = Math.floor((now.getTime() - join.getTime()) / (1000 * 60 * 60 * 24));
        return `${days} day${days !== 1 ? 's' : ''}`;
      } else if (years === 0) {
        return `${months} month${months !== 1 ? 's' : ''}`;
      } else if (months === 0) {
        return `${years} year${years !== 1 ? 's' : ''}`;
      } else {
        return `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''}`;
      }
    } catch (error) {
      console.error('Error calculating experience:', error);
      return null;
    }
  };

  const getShiftDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d, yyyy');
  };

  const fetchUpcomingShifts = async (employeeId: string) => {
    if (!employeeId) return;
    try {
      setLoadingShifts(true);
      const today = new Date();
      const nextMonth = addDays(today, 30);
      const data = await api.get(
        `/api/scheduling/employee/${employeeId}/shifts?start_date=${format(
          today,
          'yyyy-MM-dd',
        )}&end_date=${format(nextMonth, 'yyyy-MM-dd')}`,
      );
      setUpcomingShifts(data.shifts || []);
    } catch (error) {
      console.error('Error fetching upcoming shifts:', error);
      setUpcomingShifts([]);
    } finally {
      setLoadingShifts(false);
    }
  };

  useEffect(() => {
    const fetchAbout = async () => {
      if (!(api as any).getMyAbout) return;
      try {
        setAboutLoading(true);
        const data = await (api as any).getMyAbout();
        if (data) {
          setAbout(data.about_me || '');
          setJobLove(data.job_love || '');
          setHobbies(data.hobbies || '');
        }
      } catch (error) {
        console.error('Error fetching about section:', error);
      } finally {
        setAboutLoading(false);
      }
    };

    if (employee?.id) {
      fetchAbout();
      fetchUpcomingShifts(employee.id);
    }
  }, [employee?.id]);

  const handleProfilePictureUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file (JPG, PNG)',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Profile picture must be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    setUploadingProfilePic(true);
    try {
      const { url, key } = await api.getProfilePicturePresignedUrl(file.type);
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

      const result = await api.uploadProfilePicture(url, key);

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

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50 px-4 py-4">
          <div className="mx-auto max-w-7xl text-center text-sm text-gray-500">
            Loading profile…
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!employee) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50 px-4 py-4">
          <div className="mx-auto max-w-7xl text-center text-sm text-gray-500">
            Profile not found.
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50 px-3 py-4">
        <div className="mx-auto w-full max-w-[99%] space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
              <p className="mt-0.5 text-xs text-gray-600">
                Manage your profile information and preferences
              </p>
            </div>
            {employee?.id && (
              <Button
                variant="outline"
                onClick={() => navigate(`/timesheet-generator/${employee.id}?month=${new Date().toISOString().slice(0, 7)}`)}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Generate Timesheet
              </Button>
            )}
          </div>

          {/* Profile Header Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100">
                    <Avatar className="h-full w-full">
                      {employee?.id && employee.profiles?.profile_picture_url ? (
                        <ProfilePicture
                          userId={user?.id || ''}
                          src={employee.profiles.profile_picture_url}
                        />
                      ) : (
                        <AvatarImage src={undefined} />
                      )}
                      <AvatarFallback className="text-lg font-semibold text-gray-700">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingProfilePic}
                    className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-800 text-white shadow-md transition hover:bg-gray-700 disabled:opacity-50"
                  >
                    {uploadingProfilePic ? (
                      <Upload className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleProfilePictureUpload(file);
                      }
                    }}
                  />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900">{fullName}</h2>
                  <p className="mt-0.5 text-sm font-medium text-gray-700">
                    {employee.designation || employee.position || 'Employee'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">{employee.department || ''}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
                    <span>ID: {employee.employee_id || 'N/A'}</span>
                    <span>•</span>
                    <span>{employee.work_location || 'Location not set'}</span>
                    {employee.join_date && (
                      <>
                        <span>•</span>
                        <span>Joined {new Date(employee.join_date).toLocaleDateString()}</span>
                        {calculateExperience(employee.join_date) && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-gray-700">
                              {calculateExperience(employee.join_date)} in this company
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Content Grid */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Left Column - Contact & About */}
            <div className="space-y-3 lg:col-span-1">
              {/* Contact Block */}
              <Card className="h-[180px] flex flex-col">
                <CardHeader className="pb-3 flex-shrink-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-700 break-all">
                      {employee.profiles?.email || 'Not provided'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-700">
                      {employee.profiles?.phone || 'Not provided'}
                    </span>
                  </div>
                  {employee.work_location && (
                    <div className="flex items-center gap-3 text-sm">
                      <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-700">{employee.work_location}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* About Block */}
              <Card className="h-[280px] flex flex-col">
                <CardHeader className="pb-3 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">About</CardTitle>
                    {canEdit && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setAboutEditing((prev) => !prev)}
                        disabled={aboutLoading || aboutSaving}
                      >
                        {aboutEditing ? 'Cancel' : 'Edit'}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  {aboutLoading ? (
                    <p className="text-xs text-gray-400">Loading...</p>
                  ) : aboutEditing ? (
                    <form
                      className="space-y-3"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!canEdit) return;
                        try {
                          setAboutSaving(true);
                          if ((api as any).updateMyAbout) {
                            await (api as any).updateMyAbout({
                              about_me: about || null,
                              job_love: jobLove || null,
                              hobbies: hobbies || null,
                            });
                          }
                          toast({
                            title: 'Saved',
                            description: 'Your about section has been updated.',
                          });
                          setAboutEditing(false);
                        } catch (error: any) {
                          console.error('Error saving about info', error);
                          toast({
                            title: 'Unable to save',
                            description: error?.message || 'Please try again.',
                            variant: 'destructive',
                          });
                        } finally {
                          setAboutSaving(false);
                        }
                      }}
                    >
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-700">About</p>
                        <Textarea
                          value={about}
                          onChange={(e) => setAbout(e.target.value)}
                          rows={3}
                          className="text-xs"
                          placeholder="Tell your team a bit about yourself..."
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-700">What I love about my job?</p>
                        <Textarea
                          value={jobLove}
                          onChange={(e) => setJobLove(e.target.value)}
                          rows={2}
                          className="text-xs"
                          placeholder="Share what energises you..."
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-700">Hobbies</p>
                        <Textarea
                          value={hobbies}
                          onChange={(e) => setHobbies(e.target.value)}
                          rows={2}
                          className="text-xs"
                          placeholder="Your interests outside work..."
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setAboutEditing(false)}
                          disabled={aboutSaving}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={aboutSaving}>
                          {aboutSaving ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-3 text-xs text-gray-700">
                      <p>{about || 'No about information provided.'}</p>
                      {jobLove && (
                        <div>
                          <p className="font-semibold mb-1">What I love about my job?</p>
                          <p>{jobLove}</p>
                        </div>
                      )}
                      {hobbies && (
                        <div>
                          <p className="font-semibold mb-1">Hobbies</p>
                          <p>{hobbies}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Reporting Employees Block (for managers/HR) */}
              {directReports.length > 0 && (
                <Card className="h-[420px] flex flex-col">
                  <CardHeader className="pb-3 flex-shrink-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Reporting Employees ({directReports.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto">
                    {loadingReports ? (
                      <p className="text-xs text-gray-400">Loading...</p>
                    ) : (
                      <div className="space-y-2">
                        {directReports.map((report) => {
                          const reportName = `${report.profiles?.first_name || ''} ${report.profiles?.last_name || ''}`.trim() || 'Employee';
                          const reportInitials = reportName
                            .split(' ')
                            .filter(Boolean)
                            .map((n: string) => n[0])
                            .join('')
                            .toUpperCase() || 'E';
                          return (
                            <div
                              key={report.id || report.employee_id}
                              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 hover:bg-gray-100 transition-colors cursor-pointer"
                              onClick={() => navigate(`/employees/${report.id || report.employee_id}`)}
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 flex-shrink-0">
                                {reportInitials}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-900 truncate">{reportName}</p>
                                <p className="text-[10px] text-gray-600 truncate">
                                  {report.position || report.department || 'Employee'}
                                </p>
                              </div>
                              <Badge variant="outline" className="h-5 px-2 text-[10px] flex-shrink-0">
                                {report.status || 'Active'}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column - Skills, Projects, Certifications, Shifts */}
            <div className="space-y-3 lg:col-span-2">
              <div className="grid gap-3 md:grid-cols-2">
                {/* Skills Block */}
                <Card className="h-[400px] flex flex-col">
                  <CardHeader className="pb-3 flex-shrink-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      Skills
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto">
                    {employee?.id ? (
                      <EmployeeSkillsEditor employeeId={employee.id} canEdit={canEdit} />
                    ) : (
                      <p className="text-xs text-gray-400">Loading...</p>
                    )}
                  </CardContent>
                </Card>

                {/* Projects Block */}
                <Card className="h-[400px] flex flex-col">
                  <CardHeader className="pb-3 flex-shrink-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Projects
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto">
                    {employee?.id ? (
                      <EmployeePastProjectsEditor employeeId={employee.id} canEdit={canEdit} />
                    ) : (
                      <p className="text-xs text-gray-400">Loading...</p>
                    )}
                  </CardContent>
                </Card>

                {/* Certifications Block */}
                <Card className="h-[350px] flex flex-col">
                  <CardHeader className="pb-3 flex-shrink-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Award className="h-4 w-4" />
                      Certifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto">
                    {employee?.id ? (
                      <EmployeeCertificationsEditor employeeId={employee.id} canEdit={canEdit} />
                    ) : (
                      <p className="text-xs text-gray-400">Loading...</p>
                    )}
                  </CardContent>
                </Card>

                {/* Shifts Block */}
                <Card className="h-[400px] flex flex-col">
                  <CardHeader className="pb-3 flex-shrink-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      My Shifts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto">
                    {loadingShifts ? (
                      <p className="text-xs text-gray-400">Loading shifts...</p>
                    ) : upcomingShifts.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
                        <p className="text-xs text-gray-500">No shifts assigned for the next 30 days.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {upcomingShifts.slice(0, 5).map((shift) => {
                          const label = getShiftDateLabel(shift.shift_date);
                          const type = shift.shift_type || 'day';
                          return (
                            <div
                              key={shift.id}
                              className="flex items-start justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold text-gray-900">
                                    {shift.template_name || 'Shift'}
                                  </p>
                                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                                    {type}
                                  </Badge>
                                </div>
                                <p className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-600">
                                  <CalendarDays className="h-3 w-3" />
                                  {label}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 text-[10px] text-gray-700">
                                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                  <Clock className="h-3 w-3 flex-shrink-0" />
                                  <span>{formatShiftTime(shift.start_time)}</span>
                                  <span className="mx-0.5">–</span>
                                  <span>{formatShiftTime(shift.end_time)}</span>
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {upcomingShifts.length > 5 && (
                          <p className="text-xs text-gray-500 text-center pt-2">
                            +{upcomingShifts.length - 5} more shifts
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* History Timeline at Bottom */}
          <Card className="h-[450px] flex flex-col">
            <CardHeader className="pb-3 flex-shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                History Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              <AnimatedHistoryTimeline events={historyEvents} loading={loadingHistory} />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
