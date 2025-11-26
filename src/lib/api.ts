// API Client - Replaces Supabase client

const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001';
const RAG_API_URL = (import.meta as any).env.VITE_RAG_API_URL || 'http://localhost:8001';

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

  private async request(endpoint: string, options: RequestInit = {}, isFormData = false) {
    const url = `${this.baseURL}${endpoint}`;
    const headers: HeadersInit = {
      ...options.headers,
    };

    // Don't set Content-Type for FormData, let browser set it with boundary
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout. Please check your connection.');
      }
      throw error;
    }
  }

  private async ragRequest(endpoint: string, options: RequestInit = {}, isFormData = false) {
    const url = `${RAG_API_URL}${endpoint}`;
    const headers: HeadersInit = {
      ...options.headers,
    };

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('RAG service timeout. Please check the connection.');
      }
      throw error;
    }
  }

  // Auth methods
  async signup(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    orgName: string;
    domain: string;
    subdomain?: string;
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

  async requestPasswordReset(email: string) {
    return this.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async getPasswordResetInfo(token: string) {
    return this.request(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
  }

  async resetPassword(data: {
    token: string;
    password: string;
    securityAnswer1?: string;
    securityAnswer2?: string;
  }) {
    return this.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
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

  async updateEmployee(id: string, data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    employeeId?: string;
    department?: string;
    position?: string;
    workLocation?: string;
    joinDate?: string;
    reportingManagerId?: string | null;
    status?: string;
  }) {
    return this.request(`/api/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getEmployee(id: string) {
    return this.request(`/api/employees/${id}`);
  }

  async deactivateEmployee(id: string) {
    return this.request(`/api/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'inactive' }),
    });
  }

  async deleteEmployee(id: string) {
    return this.request(`/api/employees/${id}`, {
      method: 'DELETE',
    });
  }

  // Profile methods
  async getProfile() {
    return this.request('/api/profiles/me');
  }

  async updateProfile(data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  }) {
    return this.request('/api/profiles/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Organization methods
  async getOrganization() {
    return this.request('/api/organizations/me');
  }

  async updateOrganization(data: { name?: string; logo?: File }) {
    const formData = new FormData();
    if (data.name) {
      formData.append('name', data.name);
    }
    if (data.logo) {
      formData.append('logo', data.logo);
    }

    return this.request('/api/organizations/me', {
      method: 'PATCH',
      body: formData,
      headers: {} as HeadersInit, // Let browser set Content-Type with boundary
    }, true);
  }

  // Branch hierarchy
  async getBranchHierarchy() {
    return this.request('/api/branches');
  }

  async upsertBranch(payload: Record<string, any>) {
    return this.request('/api/branches/upsert', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async upsertDepartment(payload: Record<string, any>) {
    return this.request('/api/branches/departments/upsert', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async upsertTeam(payload: Record<string, any>) {
    return this.request('/api/branches/teams/upsert', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateBranchGeofence(branchId: string, payload: Record<string, any>) {
    return this.request(`/api/branches/${branchId}/geofence`, {
      method: 'PATCH',
      body: JSON.stringify(payload || {}),
    });
  }

  // Stats methods
  async getPendingCounts() {
    return this.request('/api/stats/pending-counts');
  }

  async getAuditLogs(params?: {
    limit?: number;
    action?: string;
    entity_type?: string;
    entity_id?: string;
    actor_id?: string;
    from?: string;
    to?: string;
  }) {
    const query = new URLSearchParams();
    const safeLimit = params?.limit ? Math.min(Math.max(params.limit, 1), 500) : 100;
    query.append('limit', String(safeLimit));
    if (params?.action) query.append('action', params.action);
    if (params?.entity_type) query.append('entity_type', params.entity_type);
    if (params?.entity_id) query.append('entity_id', params.entity_id);
    if (params?.actor_id) query.append('actor_id', params.actor_id);
    if (params?.from) query.append('from', params.from);
    if (params?.to) query.append('to', params.to);
    const qs = query.toString();
    return this.request(`/api/audit-logs${qs ? `?${qs}` : ''}`);
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

  // Organization setup
  async getSetupStatus() {
    return this.request('/api/setup/status');
  }

  async updateSetupStep(stepKey: string, payload: Record<string, any>) {
    return this.request(`/api/setup/steps/${stepKey}`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // Attendance settings
  async getAttendanceSettings() {
    return this.request('/api/attendance-settings');
  }

  async updateAttendanceSettings(payload: Record<string, any>) {
    return this.request('/api/attendance-settings', {
      method: 'PUT',
      body: JSON.stringify(payload || {}),
    });
  }

  async changePassword(newPassword: string) {
    return this.request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  }

  async getClockStatus() {
    return this.request('/api/v1/attendance/punch/status');
  }

  async clockPunch(payload: { type: 'IN' | 'OUT'; timestamp?: string; location?: any; metadata?: any }) {
    const body = {
      type: payload.type,
      timestamp: payload.timestamp || new Date().toISOString(),
      location: payload.location,
      metadata: payload.metadata,
    };
    return this.request('/api/v1/attendance/punch', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // New clock endpoint with geolocation and consent
  async clock(payload: {
    action: 'IN' | 'OUT';
    ts: string;
    lat?: number;
    lon?: number;
    address_text?: string;
    capture_method?: 'geo' | 'manual' | 'kiosk' | 'unknown';
    consent: boolean;
    device_id?: string;
  }) {
    return this.request('/api/attendance/clock', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Analytics endpoints
  async getAttendanceOverview(params: { from: string; to: string; branch_id?: string }) {
    const query = new URLSearchParams();
    query.append('from', params.from);
    query.append('to', params.to);
    if (params.branch_id) query.append('branch_id', params.branch_id);
    return this.request(`/api/analytics/attendance/overview?${query.toString()}`);
  }

  async getAttendanceHistogram(params: { from: string; to: string; branch_id?: string; team_id?: string; department_id?: string }) {
    const query = new URLSearchParams();
    query.append('from', params.from);
    query.append('to', params.to);
    if (params.branch_id) query.append('branch_id', params.branch_id);
    if (params.team_id) query.append('team_id', params.team_id);
    if (params.department_id) query.append('department_id', params.department_id);
    return this.request(`/api/analytics/attendance/histogram?${query.toString()}`);
  }

  async getAttendanceHeatmap(params: { from: string; to: string; branch_id?: string; group_by?: string }) {
    const query = new URLSearchParams();
    query.append('from', params.from);
    query.append('to', params.to);
    if (params.branch_id) query.append('branch_id', params.branch_id);
    if (params.group_by) query.append('group_by', params.group_by);
    return this.request(`/api/analytics/attendance/heatmap?${query.toString()}`);
  }

  async getAttendanceMap(params: { from: string; to: string; branch_id?: string; team_id?: string }) {
    const query = new URLSearchParams();
    query.append('from', params.from);
    query.append('to', params.to);
    if (params.branch_id) query.append('branch_id', params.branch_id);
    if (params.team_id) query.append('team_id', params.team_id);
    return this.request(`/api/analytics/attendance/map?${query.toString()}`);
  }

  async getAttendanceDistribution(params: { from: string; to: string; branch_id?: string; team_id?: string }) {
    const query = new URLSearchParams();
    query.append('from', params.from);
    query.append('to', params.to);
    if (params.branch_id) query.append('branch_id', params.branch_id);
    if (params.team_id) query.append('team_id', params.team_id);
    return this.request(`/api/analytics/attendance/distribution?${query.toString()}`);
  }

  // Background check methods
  async getBackgroundChecks() {
    return this.request('/api/background-checks');
  }

  async getBackgroundChecksForEmployee(employeeId: string) {
    return this.request(`/api/background-checks/employee/${employeeId}`);
  }

  async createBackgroundCheck(payload: {
    employee_id?: string;
    candidate_id?: string;
    type?: 'prehire' | 'rehire' | 'periodic';
    vendor_id?: string;
    notes?: string;
    scope?: any;
    consent?: any;
    attach_doc_ids?: string[];
  }) {
    return this.request('/api/background-checks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateBackgroundCheckStatus(id: string, data: { status: string; result_summary?: any; notes?: string }) {
    return this.request(`/api/background-checks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getBackgroundCheckReport(id: string) {
    return this.request(`/api/background-checks/${id}/report`);
  }

  // AI assistant conversation methods
  async listAIConversations() {
    return this.request('/api/ai/conversations');
  }

  async getAIConversation(id: string) {
    return this.request(`/api/ai/conversations/${id}`);
  }

  async deleteAIConversation(id: string) {
    return this.request(`/api/ai/conversations/${id}`, {
      method: 'DELETE',
    });
  }

  async renameAIConversation(id: string, title: string) {
    return this.request(`/api/ai/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  // RAG service helpers
  async queryRAG(query: string, topK?: number, useTools = true) {
    return this.ragRequest('/api/v1/query', {
      method: 'POST',
      body: JSON.stringify({
        query,
        top_k: typeof topK === 'number' ? topK : undefined,
        use_tools: useTools,
      }),
    });
  }

  async ingestDocument(file: File, isConfidential = false) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('is_confidential', String(isConfidential));
    return this.ragRequest('/api/v1/ingest', {
      method: 'POST',
      body: formData,
      headers: {} as HeadersInit,
    }, true);
  }

  async getRAGDocumentStatus(documentId: string) {
    return this.ragRequest(`/api/v1/documents/${documentId}/status`);
  }

  async getRAGDocumentProgress(documentId: string) {
    return this.ragRequest(`/api/v1/documents/${documentId}/progress`);
  }

  // Policy platform
  async getPolicyTemplates(params?: { search?: string; country?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.country) query.append('country', params.country);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/policy-platform/templates${qs}`);
  }

  async getPolicyPlatformPolicies() {
    return this.request('/api/policy-platform/policies');
  }

  async savePolicyPlatformPolicy(payload: Record<string, any>) {
    return this.request('/api/policy-platform/policies', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async publishPolicyPlatformPolicy(policyId: string, payload: Record<string, any>) {
    return this.request(`/api/policy-platform/policies/${policyId}/publish`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async getMyPerformanceReviews() {
    return this.request('/api/performance-reviews/my');
  }

  async acknowledgePerformanceReview(reviewId: string) {
    return this.request(`/api/performance-reviews/${reviewId}/acknowledge`, {
      method: 'POST',
    });
  }

  // Super admin analytics
  async getSuperMetrics(params?: Record<string, string>, mfaCode?: string) {
    const query = new URLSearchParams(params || {});
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/super/metrics${qs}`, {
      headers: {
        'X-MFA-Code': mfaCode || '',
      } as HeadersInit,
    });
  }

  async exportSuperMetrics(params?: Record<string, string>, mfaCode?: string) {
    const query = new URLSearchParams(params || {});
    const qs = query.toString() ? `?${query.toString()}` : '';
    const url = `${this.baseURL}/api/super/export${qs}`;
    const headers: HeadersInit = {};
    if (this._token) headers['Authorization'] = `Bearer ${this._token}`;
    headers['X-MFA-Code'] = mfaCode || '';
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error('Failed to export metrics');
    }
    return response.json();
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

  async submitProfileChangeRequest(changes: Record<string, any>, reason?: string) {
    return this.request('/api/employees/profile/requests', {
      method: 'POST',
      body: JSON.stringify({ changes, reason }),
    });
  }

  async skipBankDetails(employeeId: string) {
    return this.request('/api/onboarding/bank-details/skip', {
      method: 'POST',
      body: JSON.stringify({ employeeId }),
    });
  }

  async uploadOnboardingDocument(
    candidateId: string,
    payload: { file: File; docType: string; consent: boolean; notes?: string; source?: string }
  ) {
    const formData = new FormData();
    formData.append('file', payload.file);
    formData.append('doc_type', payload.docType);
    formData.append('consent', String(payload.consent));
    if (payload.notes) formData.append('notes', payload.notes);
    if (payload.source) formData.append('source', payload.source);

    return this.request(
      `/api/onboarding/${candidateId}/documents`,
      {
        method: 'POST',
        body: formData,
        headers: {} as HeadersInit,
      },
      true,
    );
  }

  async getOnboardingDocuments(candidateId: string, params?: { status?: string; docType?: string }) {
    const search = new URLSearchParams();
    if (params?.status) search.append('status', params.status);
    if (params?.docType) search.append('doc_type', params.docType);
    const qs = search.toString() ? `?${search.toString()}` : '';
    return this.request(`/api/onboarding/${candidateId}/documents${qs}`);
  }

  async approveDocument(docId: string, payload?: { notes?: string }) {
    return this.request(`/api/onboarding/documents/${docId}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async rejectDocument(docId: string, payload?: { reason?: string }) {
    return this.request(`/api/onboarding/documents/${docId}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // New presigned URL upload methods
  async getPresignedUploadUrl(filename: string, contentType: string) {
    return this.request('/api/onboarding/docs/presign', {
      method: 'POST',
      body: JSON.stringify({ filename, contentType }),
    });
  }

  async completeDocumentUpload(payload: {
    key: string;
    filename: string;
    size: number;
    checksum: string;
    docType?: string;
    consent?: boolean;
    notes?: string;
  }) {
    return this.request('/api/onboarding/docs/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getDocumentDownloadUrl(docId: string) {
    return this.request(`/api/onboarding/docs/${docId}/download`);
  }

  async getEmployeeDocumentsForHr(employeeId: string) {
    return this.request(`/api/onboarding/docs/hr/employees/${employeeId}/documents`);
  }

  async verifyDocument(docId: string, action: 'approve' | 'deny', note?: string) {
    return this.request(`/api/onboarding/docs/hr/documents/${docId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ action, note }),
    });
  }

  async requestDocumentResubmission(docId: string, payload?: { note?: string }) {
    return this.request(`/api/onboarding/documents/${docId}/request-resubmission`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async listProbations(params?: { status?: string }) {
    const search = new URLSearchParams();
    if (params?.status) search.append('status', params.status);
    const qs = search.toString() ? `?${search.toString()}` : '';
    return this.request(`/api/probation${qs}`);
  }

  async createProbation(payload: Record<string, any>) {
    return this.request('/api/probation', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getEmployeeProbation(employeeId: string) {
    return this.request(`/api/probation/employee/${employeeId}`);
  }

  async confirmProbation(probationId: string) {
    return this.request(`/api/probation/${probationId}/confirm`, {
      method: 'POST',
    });
  }

  async validateProbationLeave(employeeId: string, from: string, to: string) {
    const params = new URLSearchParams({ employee_id: employeeId, from, to });
    return this.request(`/api/probation/validate?${params.toString()}`);
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

  // Attendance methods
  async punchAttendance(data: {
    employee_id: string;
    timestamp: string;
    type: 'IN' | 'OUT';
    device_id?: string;
    metadata?: any;
  }) {
    return this.request('/api/v1/attendance/punch', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadAttendance(file: File, mapping?: any) {
    const formData = new FormData();
    formData.append('file', file);
    if (mapping) {
      formData.append('mapping', JSON.stringify(mapping));
    }

    return this.request('/api/v1/attendance/upload', {
      method: 'POST',
      body: formData,
      headers: {} as HeadersInit, // Let browser set Content-Type with boundary
    }, true);
  }

  async getUploadStatus(uploadId: string) {
    return this.request(`/api/v1/attendance/upload/${uploadId}/status`);
  }

  async retryUpload(uploadId: string, force?: boolean) {
    return this.request(`/api/v1/attendance/upload/${uploadId}/retry`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  }

  async getEmployeeAttendanceTimesheet(employeeId: string, from: string, to: string) {
    return this.request(`/api/v1/attendance/employee/${employeeId}/timesheet?from=${from}&to=${to}`);
  }

  async getAttendanceUploads() {
    return this.request('/api/v1/attendance/uploads');
  }

  async cancelUpload(uploadId: string) {
    return this.request(`/api/v1/attendance/upload/${uploadId}/cancel`, {
      method: 'POST',
    });
  }

  // Termination methods
  async getTerminations() {
    return this.request('/api/terminations');
  }

  async getTermination(id: string) {
    return this.request(`/api/terminations/${id}`);
  }

  async previewTermination(id: string) {
    return this.request(`/api/terminations/${id}/preview_settlement`);
  }

  async createTermination(data: {
    employee_id: string;
    type: 'resignation' | 'cause' | 'retrenchment' | 'redundancy' | 'mutual';
    proposed_lwd?: string;
    reason_text?: string;
    attachments?: any[];
    evidence_refs?: any[];
  }) {
    return this.request('/api/terminations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async approveTermination(id: string, data?: { action?: 'approve' | 'reject'; note?: string }) {
    return this.request(`/api/terminations/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(data || { action: 'approve' }),
    });
  }

  // Rehire methods (new workflow)
  async getRehireRequests() {
    return this.request('/api/rehire');
  }

  async getRehireRequest(id: string) {
    return this.request(`/api/rehire/${id}`);
  }

  async createRehireRequest(data: {
    ex_employee_id: string;
    requested_start_date?: string;
    prior_termination_id?: string;
    notes?: string;
  }) {
    return this.request('/api/rehire', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async decideRehire(id: string, payload: { action: 'approve' | 'reject'; note?: string }) {
    return this.request(`/api/rehire/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Offboarding methods
  async getOffboardingPolicies() {
    return this.request('/api/offboarding/policies');
  }

  async createOffboardingPolicy(data: {
    name: string;
    description?: string;
    notice_period_days: number;
    auto_approve_days?: number;
    use_ceo_approval?: boolean;
    applies_to_department?: string;
    applies_to_location?: string;
    is_default?: boolean;
  }) {
    return this.request('/api/offboarding/policies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOffboardingPolicy(id: string, data: any) {
    return this.request(`/api/offboarding/policies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteOffboardingPolicy(id: string) {
    return this.request(`/api/offboarding/policies/${id}`, {
      method: 'DELETE',
    });
  }

  async getMaskedVerification() {
    return this.request('/api/offboarding/verify/masked');
  }

  async sendVerificationOTP(type: 'email' | 'phone') {
    return this.request('/api/offboarding/verify/send', {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
  }

  async confirmVerification(type: 'email' | 'phone', otp: string) {
    return this.request('/api/offboarding/verify/confirm', {
      method: 'POST',
      body: JSON.stringify({ type, otp }),
    });
  }

  async confirmAddress(data: {
    confirmed: boolean;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  }) {
    return this.request('/api/offboarding/verify/address', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async submitOffboardingSurvey(data: {
    survey_json: any;
    reason: string;
  }) {
    return this.request('/api/offboarding/survey', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getOffboardingRequests() {
    return this.request('/api/offboarding');
  }

  async getOffboardingRequest(id: string) {
    return this.request(`/api/offboarding/${id}`);
  }

  async approveOffboarding(id: string, comment?: string) {
    return this.request(`/api/offboarding/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  }

  async denyOffboarding(id: string, comment: string) {
    return this.request(`/api/offboarding/${id}/deny`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  }

  async updateChecklist(id: string, data: {
    leaves_remaining?: number;
    financials_due?: number;
    assets_pending?: number;
    compliance_clear?: boolean;
    finance_clear?: boolean;
    it_clear?: boolean;
    notes?: string;
  }) {
    return this.request(`/api/offboarding/${id}/checklist`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async generateLetter(id: string) {
    return this.request(`/api/offboarding/${id}/generate-letter`, {
      method: 'POST',
    });
  }

  async finalizeOffboarding(id: string) {
    return this.request(`/api/offboarding/${id}/finalize`, {
      method: 'POST',
    });
  }

  // Policy methods
  async getPolicyCatalog() {
    return this.request('/api/policies/catalog');
  }

  async getOrgPolicies(date?: string) {
    const url = date 
      ? `/api/policies/org?date=${date}`
      : '/api/policies/org';
    return this.request(url);
  }

  async createOrgPolicy(data: {
    policy_key: string;
    value: any;
    effective_from?: string;
    effective_to?: string;
  }) {
    return this.request('/api/policies/org', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteOrgPolicy(id: string) {
    return this.request(`/api/policies/org/${id}`, {
      method: 'DELETE',
    });
  }

  async getEmployeePolicies(userId: string, date?: string) {
    const url = date
      ? `/api/policies/employee/${userId}?date=${date}`
      : `/api/policies/employee/${userId}`;
    return this.request(url);
  }

  async createEmployeePolicy(userId: string, data: {
    policy_key: string;
    value: any;
    effective_from?: string;
    effective_to?: string;
  }) {
    return this.request(`/api/policies/employee/${userId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Rich policy-management (document-style) methods
  async getManagedPolicies(params?: { status?: string; type?: string }) {
    const search = new URLSearchParams();
    if (params?.status) search.append('status', params.status);
    if (params?.type) search.append('type', params.type);
    const suffix = search.toString() ? `?${search.toString()}` : '';
    const res = await this.request(`/api/policy-management/policies${suffix}`);
    return res?.policies ?? [];
  }

  // Promotion methods
  async getPromotionHealth() {
    return this.request('/api/promotion/health');
  }

  async createPromotionCycle(data: {
    name: string;
    period: 'QUARTERLY' | 'H1' | 'ANNUAL' | 'CUSTOM';
    start_date: string;
    end_date: string;
    criteria?: any;
  }) {
    return this.request('/api/promotion/cycles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCurrentPromotionCycles() {
    return this.request('/api/promotion/cycles/current');
  }

  async submitPromotionEvaluation(data: {
    cycle_id: string;
    employee_id: string;
    rating: number;
    remarks?: string;
    recommendation?: 'NONE' | 'PROMOTE' | 'HOLD';
    attachments?: any;
  }) {
    return this.request('/api/promotion/evaluations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async reviewPromotionEvaluation(id: string) {
    return this.request(`/api/promotion/review/${id}`, {
      method: 'POST',
    });
  }

  async approvePromotion(id: string) {
    return this.request(`/api/promotion/approve/${id}`, {
      method: 'POST',
    });
  }

  // User invite methods
  async inviteUsers(data: {
    emails: string[];
    role: string;
  }) {
    return this.request('/api/users/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // First login
  async firstLogin(data: {
    token: string;
    newPassword: string;
  }) {
    return this.request('/api/auth/first-login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Payroll SSO
  async getPayrollSso() {
    return this.request('/api/payroll/sso');
  }

  async getPayrollRuns(params?: { status?: string; limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/api/payroll/runs${query}`);
  }

  async getPayrollRunAdjustments(runId: string) {
    return this.request(`/api/payroll/runs/${runId}/adjustments`);
  }

  async createPayrollRunAdjustment(runId: string, data: {
    employee_id: string;
    component_name: string;
    amount: number;
    is_taxable?: boolean;
    notes?: string;
  }) {
    return this.request(`/api/payroll/runs/${runId}/adjustments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePayrollRunAdjustment(adjustmentId: string, data: {
    component_name?: string;
    amount?: number;
    is_taxable?: boolean;
    notes?: string;
  }) {
    return this.request(`/api/payroll/adjustments/${adjustmentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePayrollRunAdjustment(adjustmentId: string) {
    return this.request(`/api/payroll/adjustments/${adjustmentId}`, {
      method: 'DELETE',
    });
  }

  async getTaxDefinitions(financialYear: string) {
    return this.request(`/api/tax/declarations/definitions?financial_year=${encodeURIComponent(financialYear)}`);
  }

  async getMyTaxDeclaration(financialYear: string) {
    return this.request(`/api/tax/declarations/me?financial_year=${encodeURIComponent(financialYear)}`);
  }

  async saveTaxDeclaration(data: {
    financial_year: string;
    chosen_regime: 'old' | 'new';
    status: 'draft' | 'submitted';
    items: Array<{
      component_id: string;
      declared_amount: number;
      proof_url?: string;
      notes?: string;
    }>;
  }) {
    return this.request('/api/tax/declarations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadTaxProof(params: { componentId: string; financialYear: string; file: File }) {
    const formData = new FormData();
    formData.append('component_id', params.componentId);
    formData.append('financial_year', params.financialYear);
    formData.append('file', params.file);

    return this.request(
      '/api/tax/declarations/proofs',
      {
        method: 'POST',
        body: formData,
        headers: {} as HeadersInit,
      },
      true,
    );
  }

  async getTaxDeclarations(params?: { financial_year?: string; status?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.financial_year) searchParams.append('financial_year', params.financial_year);
    if (params?.status) searchParams.append('status', params.status);
    const queryString = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/api/tax/declarations${queryString}`);
  }

  async reviewTaxDeclaration(
    declarationId: string,
    data: {
      status: 'approved' | 'rejected';
      items?: Array<{ id: string; approved_amount?: number; notes?: string }>;
      remarks?: string;
    }
  ) {
    return this.request(`/api/tax/declarations/${declarationId}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async downloadForm16(financialYear: string, employeeId?: string) {
    const params = new URLSearchParams();
    params.append('financial_year', financialYear);
    if (employeeId) {
      params.append('employee_id', employeeId);
    }
    const url = `${this.baseURL}/api/reports/form16?${params.toString()}`;
    const headers: HeadersInit = {};
    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error('Failed to download Form 16');
    }
    return response.blob();
  }

  // Roster scheduling endpoints
  async getRosterTemplates() {
    return this.request('/api/roster/templates');
  }

  async createRosterTemplate(data: {
    name: string;
    timezone?: string;
    description?: string;
    coveragePlan: Array<Record<string, any>>;
    restRules?: Record<string, any>;
    constraintRules?: Record<string, any>;
    preferenceRules?: Record<string, any>;
    metadata?: Record<string, any>;
  }) {
    return this.request('/api/roster/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRosterTemplate(
    id: string,
    data: Partial<{
      name: string;
      timezone: string;
      description: string;
      coveragePlan: Array<Record<string, any>>;
      restRules: Record<string, any>;
      constraintRules: Record<string, any>;
      preferenceRules: Record<string, any>;
      metadata: Record<string, any>;
    }>
  ) {
    return this.request(`/api/roster/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRosterTemplate(id: string) {
    return this.request(`/api/roster/templates/${id}`, {
      method: 'DELETE',
    });
  }

  async getRosterRuns() {
    return this.request('/api/roster/runs');
  }

  async startRosterRun(data: {
    templateId?: string;
    startDate: string;
    endDate: string;
    preserveManualEdits?: boolean;
    seed?: number | string | null;
    name?: string;
    existingScheduleId?: string | null;
  }) {
    return this.request('/api/roster/runs', {
      method: 'POST',
      body: JSON.stringify({
        templateId: data.templateId,
        startDate: data.startDate,
        endDate: data.endDate,
        preserveManualEdits: data.preserveManualEdits,
        seed: data.seed ?? null,
        name: data.name,
        existingScheduleId: data.existingScheduleId,
      }),
    });
  }

  async getRosterSchedules(params?: { status?: string; start_date?: string; end_date?: string }) {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.start_date) query.append('start_date', params.start_date);
    if (params?.end_date) query.append('end_date', params.end_date);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/roster/schedules${suffix}`);
  }

  async getRosterSchedule(scheduleId: string) {
    return this.request(`/api/roster/schedules/${scheduleId}`);
  }

  async updateRosterSlot(
    scheduleId: string,
    slotId: string,
    data: {
      assigned_employee_id?: string | null;
      manual_lock?: boolean;
    }
  ) {
    return this.request(`/api/roster/schedules/${scheduleId}/slots/${slotId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async publishRosterSchedule(scheduleId: string) {
    return this.request(`/api/roster/schedules/${scheduleId}/publish`, {
      method: 'POST',
    });
  }

  // Legacy scheduling endpoints (back-compat)
  async getShiftTemplates(params?: { team_id?: string; branch_id?: string }) {
    const query = new URLSearchParams();
    if (params?.team_id) query.append('team_id', params.team_id);
    if (params?.branch_id) query.append('branch_id', params.branch_id);
    return this.request(`/api/scheduling/templates?${query.toString()}`);
  }

  async createShiftTemplate(data: {
    name: string;
    start_time: string;
    end_time: string;
    shift_type: 'day' | 'evening' | 'night' | 'custom';
    duration_hours?: number;
    crosses_midnight?: boolean;
    is_default?: boolean;
    team_id?: string;
    branch_id?: string;
  }) {
    return this.request('/api/scheduling/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateShiftTemplate(
    id: string,
    data: Partial<{
      name: string;
      start_time: string;
      end_time: string;
      shift_type: string;
      duration_hours: number;
      crosses_midnight: boolean;
      is_default: boolean;
      team_id: string;
      branch_id: string;
    }>
  ) {
    return this.request(`/api/scheduling/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteShiftTemplate(id: string) {
    return this.request(`/api/scheduling/templates/${id}`, {
      method: 'DELETE',
    });
  }

  async getRuleSets() {
    return this.request('/api/scheduling/rule-sets');
  }

  async createRuleSet(data: {
    name: string;
    description?: string;
    is_default?: boolean;
    rules: Array<{
      id: string;
      name: string;
      type: 'hard' | 'soft';
      weight?: number;
      params?: Record<string, any>;
    }>;
  }) {
    return this.request('/api/scheduling/rule-sets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRuleSet(id: string, data: { name: string; description?: string; is_default?: boolean; rules: Array<any> }) {
    return this.request(`/api/scheduling/rule-sets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getAvailability(params?: { employee_id?: string; date_from?: string; date_to?: string }) {
    const query = new URLSearchParams();
    if (params?.employee_id) query.append('employee_id', params.employee_id);
    if (params?.date_from) query.append('date_from', params.date_from);
    if (params?.date_to) query.append('date_to', params.date_to);
    return this.request(`/api/scheduling/availability?${query.toString()}`);
  }

  async createAvailability(data: {
    employee_id: string;
    date: string;
    start_time?: string;
    end_time?: string;
    availability_type: 'available' | 'unavailable' | 'preferred' | 'blackout';
    shift_template_id?: string;
    is_pinned?: boolean;
    is_forbidden?: boolean;
    notes?: string;
  }) {
    return this.request('/api/scheduling/availability', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async runScheduler(data: {
    week_start_date: string;
    week_end_date: string;
    rule_set_id: string;
    algorithm: 'greedy' | 'ilp' | 'simulated_annealing';
    template_ids?: string[];
    employee_ids?: string[];
    branch_id?: string;
    team_id?: string;
    seed?: number;
    replace_schedule_id?: string;
  }) {
    return this.request('/api/scheduling/schedules/run', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSchedules(params?: { week_start?: string; week_end?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params?.week_start) query.append('week_start', params.week_start);
    if (params?.week_end) query.append('week_end', params.week_end);
    if (params?.status) query.append('status', params.status);
    return this.request(`/api/scheduling/schedules?${query.toString()}`);
  }

  async getSchedule(id: string) {
    return this.request(`/api/scheduling/schedules/${id}`);
  }

  async approveSchedule(id: string) {
    return this.request(`/api/scheduling/schedules/${id}/approve`, {
      method: 'PATCH',
    });
  }

  async deleteSchedule(id: string) {
    return this.request(`/api/scheduling/schedules/${id}`, {
      method: 'DELETE',
    });
  }

  async manualEditSchedule(
    id: string,
    data: {
      assignments: Array<{
        id?: string;
        employee_id: string;
        shift_date: string;
        shift_template_id: string;
        start_time: string;
        end_time: string;
      }>;
      reason?: string;
    }
  ) {
    return this.request(`/api/scheduling/schedules/${id}/manual-edit`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async createException(data: {
    schedule_id?: string;
    employee_id: string;
    rule_id: string;
    exception_type: 'allow_violation' | 'force_assignment' | 'prevent_assignment';
    reason: string;
  }) {
    return this.request('/api/scheduling/exceptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async approveException(id: string) {
    return this.request(`/api/scheduling/exceptions/${id}/approve`, {
      method: 'PATCH',
    });
  }

  async exportScheduleCSV(id: string) {
    const url = `${this.baseURL}/api/scheduling/schedules/${id}/export/csv`;
    const headers: HeadersInit = {};
    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error('Failed to export schedule');
    }
    return response.blob();
  }

  // ===== Workflows =====

  async listWorkflows() {
    // Returns { workflows: [...] } from /api/workflows
    return this.request('/api/workflows');
  }

  async getCalendar(params: {
    start_date: string;
    end_date: string;
    employee_id?: string;
    project_id?: string;
    view_type?: 'employee' | 'organization';
  }) {
    const query = new URLSearchParams();
    query.append('start_date', params.start_date);
    query.append('end_date', params.end_date);
    if (params.employee_id) query.append('employee_id', params.employee_id);
    if (params.project_id) query.append('project_id', params.project_id);
    if (params.view_type) query.append('view_type', params.view_type);
    return this.request(`/api/calendar?${query.toString()}`);
  }
}

export const api = new ApiClient(API_URL);

