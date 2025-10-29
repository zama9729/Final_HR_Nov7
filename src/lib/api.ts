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

  async approveTimesheet(timesheetId: string, action: 'approve' | 'reject', rejectionReason?: string) {
    return this.request(`/api/timesheets/${timesheetId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ action, rejectionReason }),
    });
  }

  // Org chart methods
  async getOrgStructure() {
    return this.request('/api/employees/org-chart');
  }
}

export const api = new ApiClient(API_URL);

