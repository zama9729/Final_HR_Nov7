import { useEffect, useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfilePicture } from '@/components/ProfilePicture';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import EmployeeSkillsEditor from '@/components/EmployeeSkillsEditor';
import EmployeePastProjectsEditor from '@/components/EmployeePastProjectsEditor';
import EmployeeHistoryTab from '@/components/EmployeeHistoryTab';
import { CalendarDays, Clock, Camera, Upload } from 'lucide-react';
import { addDays, format, isToday, isTomorrow, parseISO } from 'date-fns';

interface SimpleEmployee {
  id: string;
  employee_id?: string;
  department?: string;
  position?: string;
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

export default function MyProfile() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [employee, setEmployee] = useState<SimpleEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'personal' | 'skills' | 'projects' | 'certifications' | 'shifts' | 'history'>('personal');
  const [about, setAbout] = useState('');
  const [jobLove, setJobLove] = useState('');
  const [hobbies, setHobbies] = useState('');
  const [aboutLoading, setAboutLoading] = useState(false);
  const [aboutEditing, setAboutEditing] = useState(false);
  const [aboutSaving, setAboutSaving] = useState(false);
  const [upcomingShifts, setUpcomingShifts] = useState<any[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [uploadingProfilePic, setUploadingProfilePic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          setEmployee(emp);
        } else {
          const profile = await api.getProfile();
          setEmployee({
            id: profile.id,
            employee_id: profile.employee_code || profile.employee_id,
            department: profile.department,
            position: profile.position || profile.job_title,
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

  const fullName =
    `${employee?.profiles?.first_name || ''} ${employee?.profiles?.last_name || ''}`.trim() ||
    'Employee';

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U';

  const reportingTeam = employee?.reporting_team || [];
  const canEdit = ['employee', 'manager'].includes(userRole || '');

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

  const fetchUpcomingShifts = async (employeeId: string) => {
    if (!employeeId) return;
    try {
      setLoadingShifts(true);
      const today = new Date();
      const nextMonth = addDays(today, 30);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/scheduling/employee/${employeeId}/shifts?start_date=${format(
          today,
          'yyyy-MM-dd',
        )}&end_date=${format(nextMonth, 'yyyy-MM-dd')}`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } },
      );

      if (response.ok) {
        const data = await response.json();
        setUpcomingShifts(data.shifts || []);
      } else {
        setUpcomingShifts([]);
      }
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

  const handleTabChange = (newTab: 'personal' | 'skills' | 'projects' | 'certifications' | 'shifts' | 'history') => {
    setActiveTab(newTab);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50 px-6 py-4">
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
        <div className="min-h-screen bg-gray-50 px-6 py-4">
          <div className="mx-auto max-w-7xl text-center text-sm text-gray-500">
            Profile not found.
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50 px-4 py-3">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
              <p className="mt-0.5 text-xs text-gray-600">
                Manage your profile information and preferences
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[240px,minmax(0,1fr),260px]">
            {/* Left sidebar */}
            <aside className="space-y-3">
              <Card className="liquid-glass-card rounded-xl">
                <CardContent className="p-4">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative mb-3">
                      <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100">
                        <Avatar className="h-full w-full">
                          {employee?.id && employee.profiles?.profile_picture_url ? (
                            <ProfilePicture 
                              userId={employee.id} 
                              src={employee.profiles.profile_picture_url} 
                            />
                          ) : (
                            <AvatarImage src={undefined} />
                          )}
                          <AvatarFallback className="text-xl font-semibold text-gray-700">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingProfilePic}
                        className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-800 text-white shadow-md transition hover:bg-gray-700 disabled:opacity-50"
                      >
                        {uploadingProfilePic ? (
                          <Upload className="h-4 w-4 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4" />
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
                    <h2 className="text-lg font-bold text-gray-900">{fullName}</h2>
                    <p className="mt-1 text-sm font-medium text-gray-700">{employee.position || 'Employee'}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{employee.department || ''}</p>
                  </div>

                  <div className="mt-4 space-y-2.5 border-t border-gray-100 pt-4 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Employee ID</span>
                      <span className="font-semibold text-gray-900">
                        {employee.employee_id || 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Location</span>
                      <span className="font-semibold text-gray-900">
                        {employee.work_location || 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Status</span>
                      <Badge variant="outline" className="h-5 border-gray-300 bg-white px-2 text-[10px] font-medium text-gray-700">
                        {employee.status || 'active'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card glass-card-hover rounded-xl">
                <CardContent className="p-5 space-y-3 text-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700">
                    Contact
                  </h3>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">📞</span>
                      <span className="font-medium text-gray-800">
                        {employee.profiles?.phone || 'Not provided'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 break-all">
                      <span className="text-gray-400">✉️</span>
                      <span className="font-medium text-gray-800">
                        {employee.profiles?.email || 'Not provided'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </aside>

            {/* Center panel - Tabbed */}
            <main>
              <Card className="liquid-glass-card rounded-xl">
                <CardContent className="p-4">
                  {/* Tab Bar */}
                  <div className="mb-4 flex gap-1 border-b border-gray-200/30">
                    {[
                      { key: 'personal', label: 'Personal Details' },
                      { key: 'skills', label: 'Skills' },
                      { key: 'projects', label: 'Projects' },
                      { key: 'certifications', label: 'Certifications' },
                      { key: 'shifts', label: 'My Shifts' },
                      { key: 'history', label: 'History' },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => handleTabChange(tab.key as any)}
                        className={`relative px-4 py-2.5 text-sm font-medium liquid-glass-nav-item rounded-lg ${
                          activeTab === tab.key
                            ? 'liquid-glass-nav-item-active text-gray-900'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <span className="relative z-10">{tab.label}</span>
                        {activeTab === tab.key && (
                          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-700 via-red-600 to-red-800 z-20 rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Tab Content - No animation, just show/hide */}
                  <div className="relative" style={{ minHeight: '500px' }}>
                      {/* Personal Details Tab */}
                      {activeTab === 'personal' && (
                        <div className="space-y-4">
                          {/* About Section */}
                          <div>
                            <div className="mb-3 flex items-center justify-between">
                              <h3 className="text-lg font-bold text-gray-900">About</h3>
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

                            {aboutLoading ? (
                              <p className="text-sm text-gray-400">Loading about section…</p>
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
                                  <p className="text-sm font-semibold text-gray-700">About</p>
                                  <Textarea
                                    value={about}
                                    onChange={(e) => setAbout(e.target.value)}
                                    rows={3}
                                    className="border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400"
                                    placeholder="Tell your team a bit about yourself..."
                                  />
                                </div>
                                <div className="space-y-2">
                                  <p className="text-sm font-semibold text-gray-700">
                                    What I love about my job?
                                  </p>
                                  <Textarea
                                    value={jobLove}
                                    onChange={(e) => setJobLove(e.target.value)}
                                    rows={3}
                                    className="border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400"
                                    placeholder="Share what energises you at work..."
                                  />
                                </div>
                                <div className="space-y-2">
                                  <p className="text-sm font-semibold text-gray-700">
                                    My interests and hobbies
                                  </p>
                                  <Textarea
                                    value={hobbies}
                                    onChange={(e) => setHobbies(e.target.value)}
                                    rows={3}
                                    className="border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400"
                                    placeholder="Talk about your interests outside work..."
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="default"
                                    onClick={() => setAboutEditing(false)}
                                    disabled={aboutSaving}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="submit"
                                    size="default"
                                    disabled={aboutSaving}
                                  >
                                    {aboutSaving ? 'Saving…' : 'Save'}
                                  </Button>
                                </div>
                              </form>
                            ) : (
                              <div className="space-y-4">
                                <p className="text-sm leading-relaxed text-gray-700">
                                  {about ||
                                    'Tell your team a bit about yourself – what you do, what you care about, and how you like to work.'}
                                </p>
                                <div className="space-y-4 border-t border-gray-100 pt-4">
                                  <div>
                                    <h4 className="text-sm font-bold text-gray-900">
                                      What I love about my job?
                                    </h4>
                                    <p className="mt-1.5 text-sm leading-relaxed text-gray-700">
                                      {jobLove ||
                                        'Share what energises you at work – solving problems, collaborating with your team, helping customers, or learning new things.'}
                                    </p>
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-bold text-gray-900">
                                      My interests and hobbies
                                    </h4>
                                    <p className="mt-1.5 text-sm leading-relaxed text-gray-700">
                                      {hobbies ||
                                        "Use this space to talk about your interests outside work – hobbies, sports, creative pursuits, or anything that's important to you."}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Personal Info Grid */}
                          <div className="grid gap-4 border-t border-gray-100 pt-4 md:grid-cols-2">
                            <div className="space-y-4">
                              <div>
                                <p className="text-xs font-semibold text-gray-600">Employee ID</p>
                                <p className="mt-1 text-sm font-bold text-gray-900">{employee.employee_id || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-600">Department</p>
                                <p className="mt-1 text-sm font-bold text-gray-900">{employee.department || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-600">Designation</p>
                                <p className="mt-1 text-sm font-bold text-gray-900">{employee.position || 'N/A'}</p>
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <p className="text-xs font-semibold text-gray-600">Location</p>
                                <p className="mt-1 text-sm font-bold text-gray-900">
                                  {employee.work_location || 'Not set'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-600">Joined</p>
                                <p className="mt-1 text-sm font-bold text-gray-900">
                                  {employee.join_date
                                    ? new Date(employee.join_date).toLocaleDateString()
                                    : 'Not available'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Skills Tab */}
                      {activeTab === 'skills' && (
                        <div>
                          {employee?.id ? (
                            <div>
                              <h3 className="mb-4 text-lg font-bold text-gray-900">Skills</h3>
                              <EmployeeSkillsEditor employeeId={employee.id} canEdit={canEdit} />
                            </div>
                          ) : (
                            <div>
                              <h3 className="mb-4 text-lg font-bold text-gray-900">Skills</h3>
                              <p className="text-sm text-gray-400">Loading employee data...</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Projects Tab */}
                      {activeTab === 'projects' && (
                        <div>
                          {employee?.id ? (
                            <div>
                              <h3 className="mb-4 text-lg font-bold text-gray-900">Projects</h3>
                              <EmployeePastProjectsEditor employeeId={employee.id} canEdit={canEdit} />
                            </div>
                          ) : (
                            <div>
                              <h3 className="mb-4 text-lg font-bold text-gray-900">Projects</h3>
                              <p className="text-sm text-gray-400">Loading employee data...</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Certifications Tab */}
                      {activeTab === 'certifications' && (
                        <div>
                          <h3 className="mb-4 text-lg font-bold text-gray-900">Certifications</h3>
                          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
                            <p className="text-sm text-gray-500">No certifications added yet</p>
                            {canEdit && (
                              <Button
                                type="button"
                                variant="outline"
                                size="default"
                                className="mt-3"
                              >
                                Add Certification
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* My Shifts Tab */}
                      {activeTab === 'shifts' && (
                        <div>
                          <h3 className="mb-4 text-lg font-bold text-gray-900">My Shifts</h3>
                          {loadingShifts ? (
                            <p className="text-sm text-gray-400">Loading assigned shifts…</p>
                          ) : upcomingShifts.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                              No shifts assigned for the next 30 days.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {upcomingShifts.map((shift) => {
                                const label = getShiftDateLabel(shift.shift_date);
                                const type = shift.shift_type || 'day';
                                return (
                                  <div
                                    key={shift.id}
                                    className="liquid-glass-card flex items-start justify-between rounded-lg px-4 py-3"
                                  >
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-bold text-gray-900">
                                          {shift.template_name || 'Shift'}
                                        </p>
                                        <Badge variant="outline" className="h-5 border-gray-300 bg-white px-2 text-[10px] font-medium text-gray-700">
                                          {type}
                                        </Badge>
                                      </div>
                                      <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
                                        <CalendarDays className="h-3.5 w-3.5" />
                                        {label}
                                      </p>
                                    </div>
                                    <div className="mt-1 flex flex-col items-end gap-1 text-xs text-gray-700">
                                      <span className="inline-flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5" />
                                        {formatShiftTime(shift.start_time)} –{' '}
                                        {formatShiftTime(shift.end_time)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* History Tab */}
                      {activeTab === 'history' && (
                        <div>
                          {employee?.id ? (
                            <div>
                              <h3 className="mb-4 text-lg font-bold text-gray-900">Employee History</h3>
                              <p className="mb-4 text-sm text-gray-600">
                                View your career progression, promotions, salary changes, and awards
                              </p>
                              <EmployeeHistoryTab employeeId={employee.id} isOwnProfile />
                            </div>
                          ) : (
                            <div>
                              <h3 className="mb-4 text-lg font-bold text-gray-900">Employee History</h3>
                              <p className="text-sm text-gray-400">Loading employee data...</p>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </CardContent>
              </Card>
            </main>

            {/* Right sidebar */}
            <aside>
              <Card className="liquid-glass-card flex h-full flex-col rounded-xl">
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900">Reporting team</h3>
                    <span className="text-xs text-gray-600">
                      {reportingTeam.length} members
                    </span>
                  </div>
                  <div className="mb-4">
                    <Input
                      type="text"
                      placeholder="Search team..."
                      className="h-9 rounded-lg border-gray-300 bg-white px-3 text-xs placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                  </div>

                  <div className="mt-1 flex-1 space-y-2.5 overflow-y-auto">
                    {reportingTeam.length === 0 && (
                      <p className="text-xs text-gray-400">No direct reports configured yet.</p>
                    )}
                    {reportingTeam.map((member) => {
                      const name = `${member.profiles?.first_name || ''} ${
                        member.profiles?.last_name || ''
                      }`.trim() || 'Team member';
                      const initialsMember =
                        name
                          .split(' ')
                          .filter(Boolean)
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase() || 'T';
                      const status = member.status || 'In';

                      return (
                        <button
                          key={member.id}
                          type="button"
                          className="liquid-glass-card flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-[11px] font-semibold text-gray-700">
                              {initialsMember}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{name}</p>
                              <p className="text-[11px] text-gray-600">
                                {member.position || member.department || 'Employee'}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              status === 'In'
                                ? 'bg-gray-100 text-gray-700 border border-gray-200'
                                : status === 'Leave'
                                ? 'bg-gray-100 text-gray-700 border border-gray-200'
                                : 'bg-gray-100 text-gray-700 border border-gray-200'
                            }`}
                          >
                            {status}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
