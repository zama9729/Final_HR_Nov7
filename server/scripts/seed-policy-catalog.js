import { createPool, query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

const policyCatalog = [
  // Probation policies
  {
    key: 'probation.period_days',
    display_name: 'Probation Period (Days)',
    category: 'Employment',
    description: 'Number of days for probation period',
    value_type: 'NUMBER'
  },
  
  // Notice period policies
  {
    key: 'notice.period_days',
    display_name: 'Notice Period (Days)',
    category: 'Employment',
    description: 'Number of days required for notice period',
    value_type: 'NUMBER'
  },
  
  // Leave policies
  {
    key: 'leave.annual_allowance_days',
    display_name: 'Annual Leave Allowance (Days)',
    category: 'Leave',
    description: 'Annual leave entitlement in days',
    value_type: 'NUMBER'
  },
  {
    key: 'leave.carry_forward_max_days',
    display_name: 'Max Carry Forward Days',
    category: 'Leave',
    description: 'Maximum days that can be carried forward to next year',
    value_type: 'NUMBER'
  },
  {
    key: 'leave.sick_leave_days',
    display_name: 'Sick Leave (Days)',
    category: 'Leave',
    description: 'Annual sick leave entitlement in days',
    value_type: 'NUMBER'
  },
  {
    key: 'leave.casual_leave_days',
    display_name: 'Casual Leave (Days)',
    category: 'Leave',
    description: 'Annual casual leave entitlement in days',
    value_type: 'NUMBER'
  },
  
  // Overtime policies
  {
    key: 'overtime.rules',
    display_name: 'Overtime Rules',
    category: 'Work',
    description: 'Overtime calculation and compensation rules',
    value_type: 'JSON'
  },
  {
    key: 'overtime.approval_required',
    display_name: 'Overtime Approval Required',
    category: 'Work',
    description: 'Whether overtime requires prior approval',
    value_type: 'BOOLEAN'
  },
  
  // Attire policies
  {
    key: 'attire.casual_days',
    display_name: 'Casual Dress Days',
    category: 'Workplace',
    description: 'Days when casual dress is allowed (e.g., Friday)',
    value_type: 'JSON'
  },
  {
    key: 'attire.dress_code',
    display_name: 'Dress Code',
    category: 'Workplace',
    description: 'Office dress code policy',
    value_type: 'STRING'
  },
  
  // Company goals
  {
    key: 'company.goals',
    display_name: 'Company Goals',
    category: 'Company',
    description: 'Company-wide goals and objectives',
    value_type: 'JSON'
  },
  {
    key: 'company.values',
    display_name: 'Company Values',
    category: 'Company',
    description: 'Core company values',
    value_type: 'JSON'
  },
  
  // Holiday policies
  {
    key: 'holiday.scheme',
    display_name: 'Holiday Scheme',
    category: 'Holiday',
    description: 'Holiday scheme by state or remote fixed days',
    value_type: 'JSON'
  },
  {
    key: 'holiday.remote_fixed_days',
    display_name: 'Remote Fixed Holidays (Days)',
    category: 'Holiday',
    description: 'Fixed number of holidays for remote employees',
    value_type: 'NUMBER'
  },
  
  // Remote work policies
  {
    key: 'remote.work_policy',
    display_name: 'Remote Work Policy',
    category: 'Work',
    description: 'Remote work guidelines and policies',
    value_type: 'JSON'
  },
  {
    key: 'remote.allowed',
    display_name: 'Remote Work Allowed',
    category: 'Work',
    description: 'Whether remote work is allowed',
    value_type: 'BOOLEAN'
  },
  
  // Benefits
  {
    key: 'benefits.health_insurance',
    display_name: 'Health Insurance',
    category: 'Benefits',
    description: 'Health insurance coverage details',
    value_type: 'JSON'
  },
  {
    key: 'benefits.retirement_plan',
    display_name: 'Retirement Plan',
    category: 'Benefits',
    description: 'Retirement plan details',
    value_type: 'JSON'
  },
  
  // Performance
  {
    key: 'performance.review_frequency',
    display_name: 'Performance Review Frequency',
    category: 'Performance',
    description: 'How often performance reviews are conducted',
    value_type: 'STRING'
  },
  {
    key: 'performance.rating_scale',
    display_name: 'Performance Rating Scale',
    category: 'Performance',
    description: 'Performance rating scale (e.g., 1-5, 1-10)',
    value_type: 'JSON'
  }
];

async function seedPolicyCatalog() {
  try {
    await createPool();
    console.log('✅ Connected to database');

    let inserted = 0;
    let skipped = 0;

    for (const policy of policyCatalog) {
      try {
        // Check if policy already exists
        const existing = await query(
          'SELECT id FROM policy_catalog WHERE key = $1',
          [policy.key]
        );

        if (existing.rows.length > 0) {
          console.log(`⏭️  Skipping ${policy.key} (already exists)`);
          skipped++;
          continue;
        }

        // Insert policy
        await query(
          `INSERT INTO policy_catalog (key, display_name, category, description, value_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [policy.key, policy.display_name, policy.category, policy.description, policy.value_type]
        );

        console.log(`✅ Inserted ${policy.key}`);
        inserted++;
      } catch (error) {
        console.error(`❌ Error inserting ${policy.key}:`, error.message);
      }
    }

    console.log(`\n✅ Seed complete: ${inserted} inserted, ${skipped} skipped`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seedPolicyCatalog();

