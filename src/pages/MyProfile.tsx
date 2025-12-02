import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import EmployeeSkillsEditor from '@/components/EmployeeSkillsEditor';
import EmployeePastProjectsEditor from '@/components/EmployeePastProjectsEditor';
import EmployeeHistoryTab from '@/components/EmployeeHistoryTab';

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

const statusChipClasses: Record<string, string> = {
  In: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Leave: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  WFH: 'bg-orange-50 text-orange-700 border border-orange-200',
};

export default function MyProfile() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [employee, setEmployee] = useState<SimpleEmployee | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'personal' | 'skills' | 'projects' | 'history'>('summary');
  const [about, setAbout] = useState('');
  const [jobLove, setJobLove] = useState('');
  const [hobbies, setHobbies] = useState('');
  const [aboutLoading, setAboutLoading] = useState(false);
  const [aboutEditing, setAboutEditing] = useState(false);
  const [aboutSaving, setAboutSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Prefer full employee record
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
          // Fallback to profile-only
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

  // Load about/what I love/hobbies from backend once employee is known
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
    }
  }, [employee?.id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50 px-4 py-6">
          <div className="mx-auto max-w-6xl text-center text-sm text-muted-foreground">
            Loading profile…
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!employee) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-gray-50 px-4 py-6">
          <div className="mx-auto max-w-6xl text-center text-sm text-muted-foreground">
            Profile not found.
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50 px-4 py-6">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">My Profile</h1>
              <p className="text-sm text-gray-500">
                View your profile, work details, and reporting team.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-purple-200 bg-white text-xs font-medium text-purple-700 hover:bg-purple-50"
            >
              <span className="mr-1 h-1 w-1 rounded-full bg-purple-500" />
              Customise questions
            </Button>
          </div>

          <div className="grid gap-5 lg:grid-cols-[280px,minmax(0,1fr),300px]">
            {/* Left sidebar */}
            <aside className="space-y-4">
              <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-3 h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-gray-100 shadow-sm">
                      <Avatar className="h-full w-full">
                        <AvatarImage src={employee.profiles?.profile_picture_url} />
                        <AvatarFallback className="text-2xl font-semibold text-purple-600">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">{fullName}</h2>
                    <p className="text-sm text-gray-500">{employee.position || 'Employee'}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{employee.department || ''}</p>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Employee ID</span>
                      <span className="font-medium text-gray-800">
                        {employee.employee_id || 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Location</span>
                      <span className="font-medium text-gray-800">
                        {employee.work_location || 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Status</span>
                      <Badge variant="outline" className="text-[10px]">
                        {employee.status || 'active'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-4 space-y-3 text-xs">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Contact
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-50 text-[10px] text-purple-600">
                        📞
                      </span>
                      <span className="text-gray-700">
                        {employee.profiles?.phone || 'Not provided'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 break-all">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-50 text-[10px] text-purple-600">
                        ✉️
                      </span>
                      <span className="text-gray-700">
                        {employee.profiles?.email || 'Not provided'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </aside>

            {/* Center panel */}
            <main className="space-y-4">
              <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-4">
                  {/* Main tabs (visual only for now, About selected) */}
                  <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-2 text-xs font-medium text-gray-500">
                    <button
                      type="button"
                      className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700"
                    >
                      About
                    </button>
                  </div>

                  {/* Functional subtabs */}
                  <div className="mt-3 flex gap-3 border-b border-gray-100 pb-2 text-xs text-gray-500">
                    {[
                      { key: 'summary', label: 'Summary' },
                      { key: 'personal', label: 'Personal details' },
                      { key: 'skills', label: 'Skills' },
                      { key: 'projects', label: 'Projects' },
                      { key: 'history', label: 'Employee history' },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        className={`pb-1 transition ${
                          activeSubTab === tab.key
                            ? 'border-b-2 border-purple-500 text-purple-700'
                            : 'hover:text-gray-700'
                        }`}
                        onClick={() => setActiveSubTab(tab.key as any)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Subtab content */}
                  {activeSubTab === 'summary' && (
                    <div className="mt-4 space-y-6 text-sm text-gray-700">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">About</h3>
                        {canEdit && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-full px-3 text-xs"
                            onClick={() => setAboutEditing((prev) => !prev)}
                            disabled={aboutLoading || aboutSaving}
                          >
                            {aboutEditing ? 'Cancel' : 'Edit'}
                          </Button>
                        )}
                      </div>

                      {aboutLoading ? (
                        <p className="text-xs text-gray-400">Loading about section…</p>
                      ) : aboutEditing ? (
                        <form
                          className="space-y-4"
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
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500">About</p>
                            <Textarea
                              value={about}
                              onChange={(e) => setAbout(e.target.value)}
                              rows={3}
                              placeholder="Tell your team a bit about yourself – what you do, what you care about, and how you like to work."
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500">
                              What I love about my job?
                            </p>
                            <Textarea
                              value={jobLove}
                              onChange={(e) => setJobLove(e.target.value)}
                              rows={3}
                              placeholder="Share what energises you at work – solving problems, collaborating with your team, helping customers, or learning new things."
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500">
                              My interests and hobbies
                            </p>
                            <Textarea
                              value={hobbies}
                              onChange={(e) => setHobbies(e.target.value)}
                              rows={3}
                              placeholder="Talk about your interests outside work – hobbies, sports, creative pursuits, or anything that’s important to you."
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 px-3 text-xs"
                              onClick={() => setAboutEditing(false)}
                              disabled={aboutSaving}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              className="h-8 px-3 text-xs"
                              disabled={aboutSaving}
                            >
                              {aboutSaving ? 'Saving…' : 'Save'}
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <section className="space-y-1">
                            <p className="leading-relaxed text-gray-600">
                              {about ||
                                'Tell your team a bit about yourself – what you do, what you care about, and how you like to work.'}
                            </p>
                          </section>

                          <div className="space-y-4 border-t border-gray-100 pt-4">
                            <section className="space-y-1">
                              <h3 className="text-sm font-semibold text-gray-900">
                                What I love about my job?
                              </h3>
                              <p className="leading-relaxed text-gray-600">
                                {jobLove ||
                                  'Share what energises you at work – solving problems, collaborating with your team, helping customers, or learning new things.'}
                              </p>
                            </section>

                            <section className="space-y-1">
                              <h3 className="text-sm font-semibold text-gray-900">
                                My interests and hobbies
                              </h3>
                              <p className="leading-relaxed text-gray-600">
                                {hobbies ||
                                  'Use this space to talk about your interests outside work – hobbies, sports, creative pursuits, or anything that’s important to you.'}
                              </p>
                            </section>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {activeSubTab === 'personal' && (
                    <div className="mt-4 grid gap-4 text-sm text-gray-700 md:grid-cols-2">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium text-gray-400">Employee ID</p>
                          <p className="font-medium text-gray-900">{employee.employee_id || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-400">Department</p>
                          <p className="font-medium text-gray-900">{employee.department || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-400">Designation</p>
                          <p className="font-medium text-gray-900">{employee.position || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium text-gray-400">Location</p>
                          <p className="font-medium text-gray-900">
                            {employee.work_location || 'Not set'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-400">Joined</p>
                          <p className="font-medium text-gray-900">
                            {employee.join_date
                              ? new Date(employee.join_date).toLocaleDateString()
                              : 'Not available'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSubTab === 'skills' && employee.id && (
                    <div className="mt-4">
                      <EmployeeSkillsEditor employeeId={employee.id} canEdit={canEdit} />
                    </div>
                  )}

                  {activeSubTab === 'projects' && employee.id && (
                    <div className="mt-4">
                      <EmployeePastProjectsEditor employeeId={employee.id} canEdit={canEdit} />
                    </div>
                  )}

                  {activeSubTab === 'history' && employee.id && (
                    <div className="mt-4">
                      <EmployeeHistoryTab employeeId={employee.id} isOwnProfile />
                    </div>
                  )}
                </CardContent>
              </Card>
            </main>

            {/* Right sidebar – reporting team */}
            <aside>
              <Card className="flex h-full flex-col rounded-2xl shadow-sm">
                <CardContent className="flex h-full flex-col p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">Reporting team</h3>
                    <span className="text-xs text-gray-400">
                      {reportingTeam.length} members
                    </span>
                  </div>
                  <div className="mb-3">
                    <Input
                      type="text"
                      placeholder="Search team..."
                      className="h-8 rounded-full border-gray-200 bg-gray-50 px-3 text-xs placeholder:text-gray-400 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>

                  <div className="mt-1 flex-1 space-y-2 overflow-y-auto">
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
                          className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2 text-left text-xs shadow-sm transition hover:border-purple-200 hover:bg-purple-50/40"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-100 bg-gray-100 text-[11px] font-semibold text-purple-600">
                              {initialsMember}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{name}</p>
                              <p className="text-[11px] text-gray-500">
                                {member.position || member.department || 'Employee'}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              statusChipClasses[status] || statusChipClasses.In
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



