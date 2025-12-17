// Policy Templates - Define form fields for each policy type
export interface PolicyField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'textarea' | 'boolean' | 'date' | 'select';
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[]; // For select fields
  min?: number;
  max?: number;
  default?: any;
}

export interface PolicyTemplate {
  id: string;
  title: string;
  category: 'LEAVE' | 'OFFBOARDING' | 'GENERAL';
  description: string;
  fields: PolicyField[];
  // Function to convert form values to HTML content
  generateHTML?: (values: Record<string, any>) => string;
}

export const policyTemplates: PolicyTemplate[] = [
  // LEAVE POLICIES
  {
    id: 'annual-leave',
    title: 'Annual Leave Policy',
    category: 'LEAVE',
    description: 'Define annual leave entitlements and rules',
    fields: [
      {
        key: 'annual_leave_days',
        label: 'Annual Leave Days',
        type: 'number',
        required: true,
        placeholder: 'e.g., 20',
        description: 'Number of annual leave days per year',
        min: 0,
        max: 365,
      },
      {
        key: 'accrual_method',
        label: 'Accrual Method',
        type: 'select',
        required: true,
        options: [
          { value: 'annual', label: 'Annual (granted at start of year)' },
          { value: 'monthly', label: 'Monthly (accrues each month)' },
          { value: 'quarterly', label: 'Quarterly (accrues each quarter)' },
        ],
        default: 'annual',
      },
      {
        key: 'carry_forward_allowed',
        label: 'Allow Carry Forward',
        type: 'boolean',
        default: false,
      },
      {
        key: 'max_carry_forward_days',
        label: 'Max Carry Forward Days',
        type: 'number',
        placeholder: 'e.g., 5',
        description: 'Maximum days that can be carried forward (if allowed)',
        min: 0,
      },
      {
        key: 'min_advance_notice_days',
        label: 'Minimum Advance Notice (Days)',
        type: 'number',
        placeholder: 'e.g., 7',
        description: 'Minimum days of advance notice required',
        min: 0,
      },
      {
        key: 'max_consecutive_days',
        label: 'Maximum Consecutive Days',
        type: 'number',
        placeholder: 'e.g., 14',
        description: 'Maximum consecutive days allowed',
        min: 1,
      },
    ],
    generateHTML: (values) => {
      return `
        <h1>Annual Leave Policy</h1>
        <h2>Entitlement</h2>
        <p>Employees are entitled to <strong>${values.annual_leave_days || 0} days</strong> of annual leave per year.</p>
        
        <h2>Accrual</h2>
        <p>Leave accrues on a <strong>${values.accrual_method || 'annual'}</strong> basis.</p>
        
        ${values.carry_forward_allowed ? `
          <h2>Carry Forward</h2>
          <p>Employees may carry forward up to <strong>${values.max_carry_forward_days || 0} days</strong> of unused leave to the next year.</p>
        ` : '<p>Carry forward of unused leave is not permitted.</p>'}
        
        <h2>Request Requirements</h2>
        <p>Leave requests must be submitted at least <strong>${values.min_advance_notice_days || 0} days</strong> in advance.</p>
        <p>Maximum consecutive leave days: <strong>${values.max_consecutive_days || 'No limit'}</strong></p>
      `;
    },
  },
  {
    id: 'sick-leave',
    title: 'Sick Leave Policy',
    category: 'LEAVE',
    description: 'Define sick leave entitlements and requirements',
    fields: [
      {
        key: 'sick_leave_days',
        label: 'Sick Leave Days',
        type: 'number',
        required: true,
        placeholder: 'e.g., 10',
        description: 'Number of sick leave days per year',
        min: 0,
        max: 365,
      },
      {
        key: 'medical_certificate_required_days',
        label: 'Medical Certificate Required After (Days)',
        type: 'number',
        placeholder: 'e.g., 3',
        description: 'Medical certificate required if sick leave exceeds this many days',
        min: 0,
      },
      {
        key: 'accrual_method',
        label: 'Accrual Method',
        type: 'select',
        required: true,
        options: [
          { value: 'annual', label: 'Annual (granted at start of year)' },
          { value: 'monthly', label: 'Monthly (accrues each month)' },
        ],
        default: 'annual',
      },
    ],
    generateHTML: (values) => {
      return `
        <h1>Sick Leave Policy</h1>
        <h2>Entitlement</h2>
        <p>Employees are entitled to <strong>${values.sick_leave_days || 0} days</strong> of sick leave per year.</p>
        
        <h2>Accrual</h2>
        <p>Leave accrues on a <strong>${values.accrual_method || 'annual'}</strong> basis.</p>
        
        ${values.medical_certificate_required_days ? `
          <h2>Medical Certificate</h2>
          <p>A medical certificate is required for sick leave exceeding <strong>${values.medical_certificate_required_days} days</strong>.</p>
        ` : ''}
      `;
    },
  },
  {
    id: 'casual-leave',
    title: 'Casual Leave Policy',
    category: 'LEAVE',
    description: 'Define casual leave entitlements',
    fields: [
      {
        key: 'casual_leave_days',
        label: 'Casual Leave Days',
        type: 'number',
        required: true,
        placeholder: 'e.g., 12',
        description: 'Number of casual leave days per year',
        min: 0,
        max: 365,
      },
      {
        key: 'max_per_request',
        label: 'Maximum Days Per Request',
        type: 'number',
        placeholder: 'e.g., 2',
        description: 'Maximum days allowed per casual leave request',
        min: 1,
      },
    ],
    generateHTML: (values) => {
      return `
        <h1>Casual Leave Policy</h1>
        <h2>Entitlement</h2>
        <p>Employees are entitled to <strong>${values.casual_leave_days || 0} days</strong> of casual leave per year.</p>
        ${values.max_per_request ? `<p>Maximum days per request: <strong>${values.max_per_request} days</strong></p>` : ''}
      `;
    },
  },

  // OFFBOARDING POLICIES
  {
    id: 'notice-period',
    title: 'Notice Period Policy',
    category: 'OFFBOARDING',
    description: 'Define notice period requirements for resignation',
    fields: [
      {
        key: 'notice_period_days',
        label: 'Notice Period (Days)',
        type: 'number',
        required: true,
        placeholder: 'e.g., 30',
        description: 'Number of days notice required',
        min: 0,
        max: 365,
      },
      {
        key: 'buyout_allowed',
        label: 'Allow Buyout',
        type: 'boolean',
        default: false,
        description: 'Allow employees to buy out notice period',
      },
      {
        key: 'buyout_calculation',
        label: 'Buyout Calculation Method',
        type: 'select',
        options: [
          { value: 'daily_rate', label: 'Daily Rate' },
          { value: 'monthly_rate', label: 'Monthly Rate' },
        ],
        default: 'daily_rate',
      },
    ],
    generateHTML: (values) => {
      return `
        <h1>Notice Period Policy</h1>
        <h2>Notice Period</h2>
        <p>Employees are required to provide <strong>${values.notice_period_days || 0} days</strong> notice before resignation.</p>
        
        ${values.buyout_allowed ? `
          <h2>Buyout Option</h2>
          <p>Employees may buy out the notice period. Calculation is based on <strong>${values.buyout_calculation || 'daily_rate'}</strong>.</p>
        ` : '<p>Buyout of notice period is not permitted.</p>'}
      `;
    },
  },
  {
    id: 'exit-interview',
    title: 'Exit Interview Policy',
    category: 'OFFBOARDING',
    description: 'Define exit interview requirements',
    fields: [
      {
        key: 'exit_interview_required',
        label: 'Exit Interview Required',
        type: 'boolean',
        default: true,
      },
      {
        key: 'interview_type',
        label: 'Interview Type',
        type: 'select',
        options: [
          { value: 'in_person', label: 'In Person' },
          { value: 'virtual', label: 'Virtual' },
          { value: 'survey', label: 'Online Survey' },
        ],
        default: 'in_person',
      },
      {
        key: 'scheduled_by',
        label: 'Scheduled By',
        type: 'select',
        options: [
          { value: 'hr', label: 'HR Department' },
          { value: 'manager', label: 'Direct Manager' },
          { value: 'both', label: 'Both HR and Manager' },
        ],
        default: 'hr',
      },
    ],
    generateHTML: (values) => {
      return `
        <h1>Exit Interview Policy</h1>
        ${values.exit_interview_required ? `
          <p>Exit interviews are <strong>required</strong> for all departing employees.</p>
          <p>Interview type: <strong>${values.interview_type || 'in_person'}</strong></p>
          <p>Scheduled by: <strong>${values.scheduled_by || 'hr'}</strong></p>
        ` : '<p>Exit interviews are optional.</p>'}
      `;
    },
  },

  // GENERAL POLICIES
  {
    id: 'work-hours',
    title: 'Working Hours Policy',
    category: 'GENERAL',
    description: 'Define standard working hours',
    fields: [
      {
        key: 'start_time',
        label: 'Start Time',
        type: 'text',
        required: true,
        placeholder: 'e.g., 09:00',
        description: 'Standard work start time (24-hour format)',
      },
      {
        key: 'end_time',
        label: 'End Time',
        type: 'text',
        required: true,
        placeholder: 'e.g., 18:00',
        description: 'Standard work end time (24-hour format)',
      },
      {
        key: 'break_duration_minutes',
        label: 'Break Duration (Minutes)',
        type: 'number',
        placeholder: 'e.g., 60',
        description: 'Lunch/break duration in minutes',
        min: 0,
      },
      {
        key: 'work_days_per_week',
        label: 'Work Days Per Week',
        type: 'number',
        required: true,
        placeholder: 'e.g., 5',
        min: 1,
        max: 7,
        default: 5,
      },
    ],
    generateHTML: (values) => {
      return `
        <h1>Working Hours Policy</h1>
        <h2>Standard Hours</h2>
        <p>Standard working hours: <strong>${values.start_time || '09:00'}</strong> to <strong>${values.end_time || '18:00'}</strong></p>
        <p>Work days per week: <strong>${values.work_days_per_week || 5} days</strong></p>
        ${values.break_duration_minutes ? `<p>Break duration: <strong>${values.break_duration_minutes} minutes</strong></p>` : ''}
      `;
    },
  },
  {
    id: 'dress-code',
    title: 'Dress Code Policy',
    category: 'GENERAL',
    description: 'Define workplace dress code requirements',
    fields: [
      {
        key: 'dress_code_type',
        label: 'Dress Code Type',
        type: 'select',
        required: true,
        options: [
          { value: 'formal', label: 'Formal' },
          { value: 'business_casual', label: 'Business Casual' },
          { value: 'casual', label: 'Casual' },
          { value: 'smart_casual', label: 'Smart Casual' },
        ],
        default: 'business_casual',
      },
      {
        key: 'casual_days',
        label: 'Casual Days',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'friday', label: 'Friday' },
          { value: 'weekend', label: 'Weekend' },
        ],
        default: 'friday',
      },
      {
        key: 'additional_requirements',
        label: 'Additional Requirements',
        type: 'textarea',
        placeholder: 'Any additional dress code requirements or restrictions...',
      },
    ],
    generateHTML: (values) => {
      return `
        <h1>Dress Code Policy</h1>
        <h2>Standard Dress Code</h2>
        <p>Dress code: <strong>${values.dress_code_type || 'business_casual'}</strong></p>
        ${values.casual_days && values.casual_days !== 'none' ? `<p>Casual dress allowed on: <strong>${values.casual_days}</strong></p>` : ''}
        ${values.additional_requirements ? `<p>${values.additional_requirements}</p>` : ''}
      `;
    },
  },
  {
    id: 'probation',
    title: 'Probation Period Policy',
    category: 'GENERAL',
    description: 'Define probation period duration and terms',
    fields: [
      {
        key: 'probation_period_days',
        label: 'Probation Period (Days)',
        type: 'number',
        required: true,
        placeholder: 'e.g., 90',
        description: 'Duration of probation period in days',
        min: 0,
        max: 365,
      },
      {
        key: 'review_frequency',
        label: 'Review Frequency',
        type: 'select',
        options: [
          { value: 'monthly', label: 'Monthly' },
          { value: 'quarterly', label: 'Quarterly' },
          { value: 'mid_and_end', label: 'Mid and End' },
        ],
        default: 'monthly',
      },
      {
        key: 'extension_allowed',
        label: 'Extension Allowed',
        type: 'boolean',
        default: true,
      },
      {
        key: 'max_extension_days',
        label: 'Maximum Extension (Days)',
        type: 'number',
        placeholder: 'e.g., 30',
        description: 'Maximum days probation can be extended',
        min: 0,
      },
    ],
    generateHTML: (values) => {
      return `
        <h1>Probation Period Policy</h1>
        <h2>Duration</h2>
        <p>Probation period: <strong>${values.probation_period_days || 90} days</strong></p>
        
        <h2>Review Process</h2>
        <p>Reviews are conducted <strong>${values.review_frequency || 'monthly'}</strong>.</p>
        
        ${values.extension_allowed ? `
          <h2>Extension</h2>
          <p>Probation may be extended up to <strong>${values.max_extension_days || 30} days</strong> if needed.</p>
        ` : '<p>Extension of probation period is not permitted.</p>'}
      `;
    },
  },
  {
    id: 'custom',
    title: 'Custom Policy',
    category: 'GENERAL',
    description: 'Create a custom policy with free-form content',
    fields: [
      {
        key: 'content',
        label: 'Policy Content',
        type: 'textarea',
        required: true,
        placeholder: 'Enter the full policy content here...',
        description: 'You can use HTML formatting',
      },
    ],
    generateHTML: (values) => {
      return values.content || '<p>No content provided</p>';
    },
  },
];

// Helper function to get templates by category
export function getTemplatesByCategory(category: 'LEAVE' | 'OFFBOARDING' | 'GENERAL'): PolicyTemplate[] {
  return policyTemplates.filter(t => t.category === category);
}

// Helper function to get template by ID
export function getTemplateById(id: string): PolicyTemplate | undefined {
  return policyTemplates.find(t => t.id === id);
}























