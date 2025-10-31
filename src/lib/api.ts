// API Client - Replaces Supabase client

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ApiClient {
  private baseURL: string;
  private _token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    // Load token from localStorage
    this._token = localStorage.getItem('auth_token');
  }

  get token() {
    return this._token;
  }

  setToken(token: string | null) {
    this._token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Auth methods
  async signup(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    orgName: string;
    domain: string;
    companySize?: string;
    industry?: string;
    timezone?: string;
  }) {
    const result = await this.request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (result.token) {
      this.setToken(result.token);
    }
    return result;
  }

  async login(email: string, password: string) {
    const result = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (result.token) {
      this.setToken(result.token);
    }
    return result;
  }

  // Employee methods
  async getEmployees() {
    return this.request('/api/employees');
  }

  async createEmployee(data: {
    firstName: string;
    lastName: string;
    email: string;
    employeeId: string;
    department: string;
    position: string;
    workLocation: string;
    joinDate: string;
    reportingManagerId?: string;
    role: string;
  }) {
    return this.request('/api/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Profile methods
  async getProfile() {
    return this.request('/api/profiles/me');
  }

  // Organization methods
  async getOrganization() {
    return this.request('/api/organizations/me');
  }

  // Stats methods
  async getPendingCounts() {
    return this.request('/api/stats/pending-counts');
  }

  // Notifications methods
  async getNotifications() {
    return this.request('/api/notifications');
  }

  async markNotificationRead(id: string) {
    return this.request(`/api/notifications/${id}/read`, {
      method: 'PATCH',
    });
  }

  // Check if employee needs password change
  async checkEmployeePasswordChange() {
    return this.request('/api/employees/check-password-change');
  }

  // Onboarding tracker methods
  async getOnboardingEmployees() {
    return this.request('/api/onboarding-tracker/employees');
  }

  // Submit onboarding data
  async submitOnboarding(employeeId: string, data: any) {
    return this.request('/api/onboarding/submit', {
      method: 'POST',
      body: JSON.stringify({ employeeId, ...data }),
    });
  }

  // Timesheet methods
  async getEmployeeId() {
    return this.request('/api/timesheets/employee-id');
  }

  async getTimesheet(weekStart: string, weekEnd: string) {
    return this.request(`/api/timesheets?weekStart=${weekStart}&weekEnd=${weekEnd}`);
  }

  async saveTimesheet(weekStart: string, weekEnd: string, totalHours: number, entries: any[]) {
    return this.request('/api/timesheets', {
      method: 'POST',
      body: JSON.stringify({ weekStart, weekEnd, totalHours, entries }),
    });
  }

  async getPendingTimesheets() {
    return this.request('/api/timesheets/pending');
  }

  async approveTimesheet(timesheetId: string, action: 'approve' | 'reject' | 'return', rejectionReason?: string) {
    return this.request(`/api/timesheets/${timesheetId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ action, rejectionReason }),
    });
  }

  // Org chart methods
  async getOrgStructure() {
    return this.request('/api/employees/org-chart');
  }

  // Shift methods
  async getShifts() {
    return this.request('/api/shifts');
  }

  async getShiftsForEmployee(employeeId: string) {
    return this.request(`/api/shifts?employee_id=${employeeId}`);
  }

  async createShift(data: {
    employee_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    shift_type?: string;
    notes?: string;
    status?: string;
  }) {
    return this.request('/api/shifts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Appraisal methods
  async getAppraisalCycles() {
    return this.request('/api/appraisal-cycles');
  }

  async createAppraisalCycle(data: {
    cycle_name: string;
    cycle_year: number;
    start_date: string;
    end_date: string;
    status?: string;
  }) {
    return this.request('/api/appraisal-cycles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPerformanceReviews(cycleId?: string) {
    const url = cycleId 
      ? `/api/performance-reviews?cycle=${cycleId}`
      : '/api/performance-reviews';
    return this.request(url);
  }

  async submitPerformanceReview(data: {
    appraisal_cycle_id: string;
    employee_id: string;
    rating: number;
    performance_score: number;
    strengths?: string;
    areas_of_improvement?: string;
    goals?: string;
    comments?: string;
  }) {
    return this.request('/api/performance-reviews', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getTeamMembers() {
    return this.request('/api/employees?team=mine');
  }

  // Employee project assignments
  async getEmployeeProjects(employeeId: string, date?: string) {
    const url = date 
      ? `/api/timesheets/employee/${employeeId}/projects?date=${date}`
      : `/api/timesheets/employee/${employeeId}/projects`;
    return this.request(url);
  }

  // Project methods
  async getProjects() {
    return this.request('/api/v1/projects');
  }

  async getProject(id: string) {
    return this.request(`/api/v1/projects/${id}`);
  }

  async createProject(data: {
    name: string;
    start_date?: string;
    end_date?: string;
    required_skills?: string[];
    required_certifications?: string[];
    priority?: number;
    expected_allocation_percent?: number;
    location?: string;
  }) {
    return this.request('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: string, data: {
    name?: string;
    start_date?: string;
    end_date?: string;
    required_skills?: string[];
    required_certifications?: string[];
    priority?: number;
    expected_allocation_percent?: number;
    location?: string;
  }) {
    return this.request(`/api/v1/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string) {
    return this.request(`/api/v1/projects/${id}`, {
      method: 'DELETE',
    });
  }

  async getProjectAssignments(projectId: string) {
    return this.request(`/api/v1/projects/${projectId}/assignments`);
  }

  async deallocateAssignment(projectId: string, assignmentId: string, endDate?: string, reason?: string) {
    return this.request(`/api/v1/projects/${projectId}/deallocate`, {
      method: 'POST',
      body: JSON.stringify({ assignment_id: assignmentId, end_date: endDate, reason }),
    });
  }

  async replaceAssignment(projectId: string, data: {
    old_assignment_id: string;
    new_employee_id: string;
    allocation_percent: number;
    role?: string;
    start_date?: string;
    end_date?: string;
    override?: boolean;
    override_reason?: string;
    reason?: string;
  }) {
    return this.request(`/api/v1/projects/${projectId}/replace`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Employee statistics
  async getEmployeeStats(params?: { startDate?: string; endDate?: string; employeeId?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.employeeId) queryParams.append('employeeId', params.employeeId);
    const url = `/api/employee-stats${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return this.request(url);
  }

  // Leave policy methods
  async getLeavePolicies() {
    return this.request('/api/leave-policies');
  }

  async createLeavePolicy(data: {
    name: string;
    leave_type: string;
    annual_entitlement: number;
    probation_entitlement?: number;
    carry_forward_allowed?: boolean;
    max_carry_forward?: number;
    encashment_allowed?: boolean;
  }) {
    return this.request('/api/leave-policies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Leave request methods
  async getLeaveRequests() {
    return this.request('/api/leave-requests');
  }

  async createLeaveRequest(data: {
    leave_type_id: string;
    start_date: string;
    end_date: string;
    reason?: string;
  }) {
    return this.request('/api/leave-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async approveLeaveRequest(id: string) {
    return this.request(`/api/leave-requests/${id}/approve`, {
      method: 'PATCH',
    });
  }

  async rejectLeaveRequest(id: string, rejection_reason: string) {
    return this.request(`/api/leave-requests/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ rejection_reason }),
    });
  }

  // Leave balance
  async getLeaveBalance() {
    return this.request('/api/stats/leave-balance');
  }

  // Workflow runtime
  async triggerWorkflow(data: { name?: string; workflow: any; payload?: any }) {
    return this.request('/api/workflows/trigger', { method: 'POST', body: JSON.stringify(data) });
  }

  async getPendingWorkflowActions() {
    return this.request('/api/workflows/actions/pending');
  }

  async decideWorkflowAction(actionId: string, decision: 'approve' | 'reject', reason?: string, workflow?: any) {
    return this.request(`/api/workflows/actions/${actionId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason, workflow })
    });
  }

  // Presence status methods
  async updatePresenceStatus(presenceStatus: 'online' | 'away' | 'out_of_office' | 'break') {
    return this.request('/api/profiles/me/presence', {
      method: 'POST',
      body: JSON.stringify({ presence_status: presenceStatus })
    });
  }

  async getPresenceStatus() {
    return this.request('/api/profiles/me/presence');
  }

  // Check-in/Check-out methods
  async checkIn() {
    return this.request('/api/check-in-out/check-in', {
      method: 'POST'
    });
  }

  async checkOut() {
    return this.request('/api/check-in-out/check-out', {
      method: 'POST'
    });
  }

  async getTodayCheckIns() {
    return this.request('/api/check-in-out/today');
  }

  async getCheckInHistory(startDate: string, endDate: string) {
    return this.request(`/api/check-in-out/history?startDate=${startDate}&endDate=${endDate}`);
  }

  async getCheckInStatus() {
    return this.request('/api/check-in-out/status');
  }
}

export const api = new ApiClient(API_URL);

