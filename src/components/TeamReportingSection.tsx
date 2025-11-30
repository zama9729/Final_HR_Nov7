import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { Users, Building2, Briefcase, User, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface TeamMembership {
  id: string;
  team_id: string;
  team_name?: string;
  team_type: 'FUNCTIONAL' | 'PROJECT';
  role: 'MEMBER' | 'MANAGER' | 'LEAD' | 'COORDINATOR';
  is_primary: boolean;
  start_date: string;
  end_date?: string;
}

interface ReportingLine {
  id: string;
  manager_id: string;
  manager_name: string;
  manager_email?: string;
  relationship_type: 'PRIMARY_MANAGER' | 'SECONDARY_MANAGER' | 'PROJECT_MANAGER';
  team_id?: string;
  team_name?: string;
  start_date: string;
  end_date?: string;
}

interface ProjectAllocation {
  id: string;
  project_id: string;
  project_name?: string;
  allocation_type: 'FULL_TIME' | 'PART_TIME' | 'AD_HOC';
  percent_allocation?: number;
  role_on_project?: string;
  start_date: string;
  end_date?: string;
  project_manager_name?: string;
}

interface TeamReportingSectionProps {
  employeeId: string;
}

export function TeamReportingSection({ employeeId }: TeamReportingSectionProps) {
  const { toast } = useToast();
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);
  const [reportingLines, setReportingLines] = useState<ReportingLine[]>([]);
  const [projectAllocations, setProjectAllocations] = useState<ProjectAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [employeeId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch team memberships
      const teams = await api.getTeams();
      const allMemberships: TeamMembership[] = [];
      for (const team of teams) {
        try {
          const members = await api.getTeamMembers(team.id);
          const employeeMemberships = members.filter((m: any) => m.employee_id === employeeId && !m.end_date);
          for (const mem of employeeMemberships) {
            allMemberships.push({
              ...mem,
              team_name: team.name,
              team_type: team.team_type,
            });
          }
        } catch (err) {
          // Team might not exist or no access
        }
      }
      setTeamMemberships(allMemberships);

      // Fetch reporting lines
      const reporting = await api.getEmployeeReportingLines(employeeId);
      setReportingLines(reporting);

      // Fetch project allocations (from all projects)
      const projects = await api.getProjects();
      const allAllocations: ProjectAllocation[] = [];
      for (const project of projects) {
        try {
          const members = await api.getProjectMembers(project.id);
          const employeeAllocs = members.filter((m: any) => m.employee_id === employeeId && !m.end_date);
          for (const alloc of employeeAllocs) {
            allAllocations.push({
              ...alloc,
              project_name: project.name,
            });
          }
        } catch (err) {
          // Project might not exist or no access
        }
      }
      setProjectAllocations(allAllocations);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch team and reporting data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team & Reporting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const primaryTeam = teamMemberships.find((tm) => tm.is_primary && tm.team_type === 'FUNCTIONAL');
  const primaryManager = reportingLines.find((rl) => rl.relationship_type === 'PRIMARY_MANAGER');
  const secondaryTeams = teamMemberships.filter((tm) => !tm.is_primary || tm.team_type === 'PROJECT');
  const projectManagers = reportingLines.filter((rl) => rl.relationship_type === 'PROJECT_MANAGER');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Team & Reporting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Primary Manager & Team */}
        <div>
          <Label className="text-base font-semibold mb-3 block">Primary Manager & Team</Label>
          <div className="space-y-3">
            {primaryTeam && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">{primaryTeam.team_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {primaryTeam.role} {primaryTeam.is_primary && <Badge variant="outline" className="ml-2">Primary</Badge>}
                  </div>
                </div>
              </div>
            )}
            {primaryManager && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <User className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">{primaryManager.manager_name}</div>
                  <div className="text-sm text-muted-foreground">
                    Primary Manager
                    {primaryManager.manager_email && ` • ${primaryManager.manager_email}`}
                  </div>
                </div>
              </div>
            )}
            {!primaryTeam && !primaryManager && (
              <p className="text-sm text-muted-foreground">No primary team or manager assigned</p>
            )}
          </div>
        </div>

        {/* Project Assignments */}
        {projectAllocations.length > 0 && (
          <div>
            <Label className="text-base font-semibold mb-3 block">Project Assignments</Label>
            <div className="space-y-3">
              {projectAllocations.map((alloc) => (
                <div key={alloc.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium">{alloc.project_name}</div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {alloc.role_on_project && (
                        <div>Role: {alloc.role_on_project}</div>
                      )}
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{alloc.allocation_type}</Badge>
                        {alloc.percent_allocation && (
                          <span>{alloc.percent_allocation}% allocation</span>
                        )}
                      </div>
                      {alloc.project_manager_name && (
                        <div className="flex items-center gap-1">
                          <ArrowRight className="h-3 w-3" />
                          <span>PM: {alloc.project_manager_name}</span>
                        </div>
                      )}
                      <div className="text-xs">
                        {format(new Date(alloc.start_date), 'MMM d, yyyy')}
                        {alloc.end_date && ` - ${format(new Date(alloc.end_date), 'MMM d, yyyy')}`}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Teams / Secondary Managers */}
        {(secondaryTeams.length > 0 || projectManagers.length > 0) && (
          <div>
            <Label className="text-base font-semibold mb-3 block">Additional Teams / Secondary Managers</Label>
            <div className="space-y-3">
              {secondaryTeams.map((team) => (
                <div key={team.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">{team.team_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {team.team_type} • {team.role}
                    </div>
                  </div>
                </div>
              ))}
              {projectManagers.map((pm) => (
                <div key={pm.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">{pm.manager_name}</div>
                    <div className="text-sm text-muted-foreground">
                      Project Manager
                      {pm.team_name && ` • ${pm.team_name}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {teamMemberships.length === 0 && reportingLines.length === 0 && projectAllocations.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No team or reporting information available
          </p>
        )}
      </CardContent>
    </Card>
  );
}

