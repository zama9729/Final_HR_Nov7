import { createPool, query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_POLICIES = [
  {
    key: 'employment_contract',
    title: 'Employment / Appointment Contract Policy',
    type: 'doc',
    template_text: `EMPLOYMENT CONTRACT POLICY

1. SCOPE
This policy applies to all employees of {{org_name}}.

2. APPOINTMENT
All appointments are subject to:
- Verification of credentials
- Background checks
- Medical fitness certificate
- Acceptance of terms and conditions

3. CONTRACT TERMS
- Probation period: {{probation_days}} days
- Notice period: {{notice_period_days}} days
- Employment type: As per appointment letter

4. TERMINATION
Termination may occur due to:
- Resignation
- Retirement
- Misconduct
- Redundancy

Effective Date: {{effective_from}}`,
    value_json: {
      probation_days: 90,
      notice_period_days: 30,
    },
  },
  {
    key: 'probation_confirmation',
    title: 'Probation and Confirmation Policy',
    type: 'doc',
    template_text: `PROBATION AND CONFIRMATION POLICY

1. PROBATION PERIOD
- Standard probation period: {{probation_days}} days
- May be extended up to {{max_probation_extension_days}} days if required
- Performance review at mid-point and end of probation

2. CONFIRMATION PROCESS
- Manager assessment
- HR review
- Confirmation letter issued upon successful completion

3. EXTENSION
Probation may be extended if:
- Performance improvement needed
- Additional training required
- Manager recommendation`,
    value_json: {
      probation_days: 90,
      max_probation_extension_days: 180,
    },
  },
  {
    key: 'code_of_conduct',
    title: 'Code of Conduct & Ethics',
    type: 'doc',
    template_text: `CODE OF CONDUCT & ETHICS

1. PROFESSIONAL BEHAVIOR
All employees must:
- Maintain highest standards of integrity
- Treat colleagues with respect
- Follow all company policies
- Report violations promptly

2. CONFLICTS OF INTEREST
Employees must disclose any potential conflicts of interest.

3. CONFIDENTIALITY
All employees must maintain confidentiality of company information.`,
    value_json: {},
  },
  {
    key: 'equal_opportunity',
    title: 'Equal Opportunity, Diversity & Non-Discrimination Policy',
    type: 'doc',
    template_text: `EQUAL OPPORTUNITY POLICY

1. COMMITMENT
{{org_name}} is committed to:
- Equal opportunity employment
- Diversity and inclusion
- Non-discrimination based on race, gender, religion, etc.

2. RECRUITMENT
All positions are open to qualified candidates regardless of background.

3. WORKPLACE
We maintain a harassment-free workplace for all employees.`,
    value_json: {},
  },
  {
    key: 'posh',
    title: 'POSH Policy (Prevention of Sexual Harassment)',
    type: 'doc',
    template_text: `PREVENTION OF SEXUAL HARASSMENT (POSH) POLICY

1. OBJECTIVE
To prevent and address sexual harassment in the workplace.

2. DEFINITION
Sexual harassment includes:
- Unwelcome physical contact
- Sexually suggestive remarks
- Display of offensive material
- Any other unwelcome conduct of sexual nature

3. POSH COMMITTEE
- Internal Complaints Committee (ICC) established
- Chairperson: {{posh_chairperson}}
- Members: {{posh_members}}
- External member: {{posh_external_member}}

4. COMPLAINT PROCEDURE
- Complaints can be filed with ICC
- Investigation within {{posh_investigation_days}} days
- Appropriate action taken`,
    value_json: {
      posh_chairperson: 'HR Head',
      posh_members: '2 Internal Members',
      posh_external_member: 'External Legal Expert',
      posh_investigation_days: 90,
    },
  },
  {
    key: 'working_hours',
    title: 'Working Hours, Overtime & Attendance Policy',
    type: 'doc',
    template_text: `WORKING HOURS & ATTENDANCE POLICY

1. WORKING HOURS
- Standard hours: {{default_start}} to {{default_end}}
- Break: 1 hour lunch break
- Flexible timing available for certain roles

2. OVERTIME
- Overtime rate: {{overtime_rate_multiplier}}x regular rate
- Pre-approval required
- Compensatory leave option available

3. ATTENDANCE
- Regular attendance mandatory
- Leave application required for absences
- Late arrival/early departure tracked`,
    value_json: {
      default_start: '09:00',
      default_end: '18:00',
      overtime_rate_multiplier: 1.5,
    },
  },
  {
    key: 'leave_policy',
    title: 'Leave Policy',
    type: 'doc',
    template_text: `LEAVE POLICY

1. ANNUAL LEAVE
- Entitlement: {{annual_leave_days}} days per year
- Accrual: Monthly
- Carry forward: Up to {{max_carry_forward_days}} days

2. SICK LEAVE
- Entitlement: {{sick_leave_days}} days per year
- Medical certificate required for 3+ consecutive days

3. MATERNITY LEAVE
- Entitlement: {{maternity_leave_weeks}} weeks
- As per applicable labor laws

4. PATERNITY LEAVE
- Entitlement: {{paternity_leave_days}} days
- To be availed within 6 months of birth

5. OTHER LEAVES
- Casual leave: {{casual_leave_days}} days
- Bereavement leave: {{bereavement_leave_days}} days`,
    value_json: {
      annual_leave_days: 12,
      sick_leave_days: 12,
      maternity_leave_weeks: 26,
      paternity_leave_days: 5,
      casual_leave_days: 6,
      bereavement_leave_days: 5,
      max_carry_forward_days: 5,
    },
  },
  {
    key: 'remote_work',
    title: 'Remote Work / Hybrid Policy',
    type: 'doc',
    template_text: `REMOTE WORK / HYBRID POLICY

1. ELIGIBILITY
Remote work available for eligible roles as per manager approval.

2. WFH LIMITS
- Maximum WFH days per month: {{max_wfh_days_per_month}}
- Minimum office attendance: {{min_office_days_per_month}} days

3. REQUIREMENTS
- Reliable internet connection
- Dedicated workspace
- Regular check-ins with manager`,
    value_json: {
      max_wfh_days_per_month: 10,
      min_office_days_per_month: 15,
    },
  },
  {
    key: 'travel_expense',
    title: 'Travel & Expense Policy',
    type: 'doc',
    template_text: `TRAVEL & EXPENSE POLICY

1. TRAVEL APPROVAL
- Pre-approval required for all business travel
- Manager approval for domestic travel
- Director/CEO approval for international travel

2. EXPENSE REIMBURSEMENT
- Submit receipts within {{expense_submission_days}} days
- Reimbursement processed within {{expense_processing_days}} days
- Per diem rates as per company guidelines`,
    value_json: {
      expense_submission_days: 7,
      expense_processing_days: 14,
    },
  },
  {
    key: 'compensation_benefits',
    title: 'Compensation & Benefits Policy',
    type: 'doc',
    template_text: `COMPENSATION & BENEFITS POLICY

1. SALARY STRUCTURE
- Competitive market rates
- Annual performance reviews
- Increment based on performance

2. BENEFITS
- Health insurance
- Provident Fund
- Gratuity
- Other benefits as per appointment letter`,
    value_json: {},
  },
  {
    key: 'pf_gratuity',
    title: 'Provident Fund / Gratuity Policy',
    type: 'doc',
    template_text: `PROVIDENT FUND & GRATUITY POLICY

1. PROVIDENT FUND
- Employee contribution: {{pf_employee_percent}}%
- Employer contribution: {{pf_employer_percent}}%
- As per EPF Act

2. GRATUITY
- Eligibility: 5+ years of service
- Calculation: As per Gratuity Act
- Payment on retirement/resignation`,
    value_json: {
      pf_employee_percent: 12,
      pf_employer_percent: 12,
    },
  },
];

async function seedPolicies() {
  try {
    await createPool();
    console.log('🌱 Seeding default policies...\n');

    // Get all organizations
    const orgsResult = await query('SELECT id, name FROM organizations');
    
    if (orgsResult.rows.length === 0) {
      console.log('❌ No organizations found. Please create an organization first.');
      return;
    }

    for (const org of orgsResult.rows) {
      console.log(`📋 Seeding policies for: ${org.name}`);

      for (const policy of DEFAULT_POLICIES) {
        // Check if policy already exists
        const existing = await query(
          'SELECT id FROM policies WHERE org_id = $1 AND key = $2',
          [org.id, policy.key]
        );

        if (existing.rows.length > 0) {
          console.log(`  ⏭️  Skipping ${policy.key} (already exists)`);
          continue;
        }

        // Insert policy
        await query(
          `INSERT INTO policies (
            org_id, key, title, type, value_json, template_text,
            status, version, created_by
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'draft', 1, NULL)
          ON CONFLICT DO NOTHING`,
          [
            org.id,
            policy.key,
            policy.title,
            policy.type,
            JSON.stringify(policy.value_json),
            policy.template_text.replace('{{org_name}}', org.name),
          ]
        );

        console.log(`  ✅ Created ${policy.key}`);
      }
    }

    console.log('\n✅ Policy seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding policies:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seedPolicies();


