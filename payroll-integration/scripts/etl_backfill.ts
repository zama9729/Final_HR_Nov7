/**
 * ETL Script: Backfill Payroll from HR
 * 
 * This script matches existing Payroll users with HR users by email
 * and backfills hr_user_id and org_id columns.
 * 
 * Usage:
 *   ts-node scripts/etl_backfill.ts
 * 
 * Environment Variables:
 *   HR_DB_URL - HR PostgreSQL connection string
 *   PAYROLL_DB_URL - Payroll PostgreSQL connection string
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const hrPool = new Pool({
  connectionString: process.env.HR_DB_URL || process.env.DATABASE_URL,
});

const payrollPool = new Pool({
  connectionString: process.env.PAYROLL_DB_URL || process.env.PAYROLL_DATABASE_URL,
});

interface HrUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  tenant_id: string;
  roles: string[];
}

interface PayrollUser {
  id: string;
  email: string;
  hr_user_id: string | null;
  org_id: string | null;
}

/**
 * Map HR roles to Payroll role
 */
function mapHrToPayrollRole(hrRoles: string[]): 'payroll_admin' | 'payroll_employee' {
  const adminSet = new Set(['CEO', 'Admin', 'HR', 'ceo', 'admin', 'hr']);
  return hrRoles.some(r => adminSet.has(r)) ? 'payroll_admin' : 'payroll_employee';
}

/**
 * Backfill Payroll users from HR
 */
async function backfillUsers() {
  console.log('Starting ETL backfill...');

  try {
    // Get all HR users with their roles
    const hrUsersResult = await hrPool.query(`
      SELECT 
        p.id,
        p.email,
        p.first_name,
        p.last_name,
        p.tenant_id,
        ARRAY_AGG(ur.role) FILTER (WHERE ur.role IS NOT NULL) as roles
      FROM profiles p
      LEFT JOIN user_roles ur ON ur.user_id = p.id
      WHERE p.email IS NOT NULL
      GROUP BY p.id, p.email, p.first_name, p.last_name, p.tenant_id
    `);

    const hrUsers: HrUser[] = hrUsersResult.rows.map(row => ({
      id: row.id,
      email: row.email.toLowerCase().trim(),
      first_name: row.first_name,
      last_name: row.last_name,
      tenant_id: row.tenant_id,
      roles: row.roles || []
    }));

    console.log(`Found ${hrUsers.length} HR users`);

    // Get all Payroll users
    const payrollUsersResult = await payrollPool.query(`
      SELECT id, email, hr_user_id, org_id
      FROM users
      WHERE email IS NOT NULL
    `);

    const payrollUsers: PayrollUser[] = payrollUsersResult.rows.map(row => ({
      id: row.id,
      email: row.email.toLowerCase().trim(),
      hr_user_id: row.hr_user_id,
      org_id: row.org_id
    }));

    console.log(`Found ${payrollUsers.length} Payroll users`);

    // Match by email
    let matched = 0;
    let updated = 0;
    let created = 0;
    const unmatched: string[] = [];

    for (const payrollUser of payrollUsers) {
      const hrUser = hrUsers.find(hu => hu.email === payrollUser.email);

      if (hrUser) {
        matched++;
        
        // Update Payroll user with HR data
        if (!payrollUser.hr_user_id || payrollUser.hr_user_id !== hrUser.id) {
          const payrollRole = mapHrToPayrollRole(hrUser.roles);
          
          await payrollPool.query(`
            UPDATE users
            SET 
              hr_user_id = $1,
              org_id = $2,
              payroll_role = $3,
              first_name = COALESCE(first_name, $4),
              last_name = COALESCE(last_name, $5)
            WHERE id = $6
          `, [
            hrUser.id,
            hrUser.tenant_id,
            payrollRole,
            hrUser.first_name,
            hrUser.last_name,
            payrollUser.id
          ]);

          updated++;
          console.log(`✓ Updated: ${payrollUser.email} → HR ID: ${hrUser.id}, Role: ${payrollRole}`);
        }
      } else {
        unmatched.push(payrollUser.email);
      }
    }

    // Create Payroll orgs from HR orgs
    const hrOrgsResult = await hrPool.query(`
      SELECT id, name, domain, timezone
      FROM organizations
    `);

    for (const hrOrg of hrOrgsResult.rows) {
      await payrollPool.query(`
        INSERT INTO payroll_orgs (hr_org_id, name, domain, timezone)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (hr_org_id) DO UPDATE
        SET name = EXCLUDED.name,
            domain = EXCLUDED.domain,
            timezone = EXCLUDED.timezone,
            updated_at = now()
      `, [hrOrg.id, hrOrg.name, hrOrg.domain, hrOrg.timezone || 'Asia/Kolkata']);
    }

    console.log(`\n✓ Backfilled ${hrOrgsResult.rows.length} organizations`);

    // Backfill bank/tax data from HR onboarding_data
    const onboardingDataResult = await hrPool.query(`
      SELECT 
        e.user_id as hr_user_id,
        od.bank_account_number,
        od.bank_name,
        od.bank_branch,
        od.ifsc_code,
        od.pan_number,
        od.aadhar_number,
        od.passport_number
      FROM onboarding_data od
      JOIN employees e ON e.id = od.employee_id
      WHERE e.user_id IS NOT NULL
    `);

    for (const data of onboardingDataResult.rows) {
      await payrollPool.query(`
        INSERT INTO payroll_user_ext (
          hr_user_id, bank_account, bank_name, bank_branch, 
          ifsc_code, pan, aadhar, passport
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (hr_user_id) DO UPDATE
        SET 
          bank_account = COALESCE(EXCLUDED.bank_account, payroll_user_ext.bank_account),
          bank_name = COALESCE(EXCLUDED.bank_name, payroll_user_ext.bank_name),
          bank_branch = COALESCE(EXCLUDED.bank_branch, payroll_user_ext.bank_branch),
          ifsc_code = COALESCE(EXCLUDED.ifsc_code, payroll_user_ext.ifsc_code),
          pan = COALESCE(EXCLUDED.pan, payroll_user_ext.pan),
          aadhar = COALESCE(EXCLUDED.aadhar, payroll_user_ext.aadhar),
          passport = COALESCE(EXCLUDED.passport, payroll_user_ext.passport),
          updated_at = now()
      `, [
        data.hr_user_id,
        data.bank_account_number,
        data.bank_name,
        data.bank_branch,
        data.ifsc_code,
        data.pan_number,
        data.aadhar_number,
        data.passport_number
      ]);
    }

    console.log(`✓ Backfilled ${onboardingDataResult.rows.length} user extension records`);

    // Summary
    console.log('\n=== ETL Backfill Summary ===');
    console.log(`Matched: ${matched}/${payrollUsers.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Created: ${created}`);
    if (unmatched.length > 0) {
      console.log(`\n⚠️  Unmatched Payroll users (${unmatched.length}):`);
      unmatched.slice(0, 10).forEach(email => console.log(`  - ${email}`));
      if (unmatched.length > 10) {
        console.log(`  ... and ${unmatched.length - 10} more`);
      }
    }

  } catch (error) {
    console.error('ETL backfill error:', error);
    throw error;
  } finally {
    await hrPool.end();
    await payrollPool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  backfillUsers()
    .then(() => {
      console.log('\n✅ ETL backfill completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ ETL backfill failed:', error);
      process.exit(1);
    });
}

export { backfillUsers, mapHrToPayrollRole };

