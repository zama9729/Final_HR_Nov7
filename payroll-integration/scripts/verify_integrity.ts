/**
 * Verification Script: Check Payroll-HR Integration Integrity
 * 
 * Verifies that:
 * 1. All Payroll users have hr_user_id (or are intentionally unmatched)
 * 2. All hr_user_id values exist in HR system
 * 3. All org_id values match between systems
 * 4. Role mappings are correct
 * 
 * Usage:
 *   ts-node scripts/verify_integrity.ts
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

interface VerificationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalPayrollUsers: number;
    linkedUsers: number;
    unlinkedUsers: number;
    invalidHrUserIds: number;
    invalidOrgIds: number;
    roleMismatches: number;
  };
}

async function verifyIntegrity(): Promise<VerificationResult> {
  const result: VerificationResult = {
    passed: true,
    errors: [],
    warnings: [],
    stats: {
      totalPayrollUsers: 0,
      linkedUsers: 0,
      unlinkedUsers: 0,
      invalidHrUserIds: 0,
      invalidOrgIds: 0,
      roleMismatches: 0
    }
  };

  try {
    // Get all Payroll users
    const payrollUsersResult = await payrollPool.query(`
      SELECT id, email, hr_user_id, org_id, payroll_role
      FROM users
    `);

    result.stats.totalPayrollUsers = payrollUsersResult.rows.length;

    // Get all HR users
    const hrUsersResult = await hrPool.query(`
      SELECT 
        p.id,
        p.email,
        p.tenant_id,
        ARRAY_AGG(ur.role) FILTER (WHERE ur.role IS NOT NULL) as roles
      FROM profiles p
      LEFT JOIN user_roles ur ON ur.user_id = p.id
      GROUP BY p.id, p.email, p.tenant_id
    `);

    const hrUsersMap = new Map(
      hrUsersResult.rows.map(row => [row.id, {
        email: row.email.toLowerCase().trim(),
        tenant_id: row.tenant_id,
        roles: row.roles || []
      }])
    );

    // Get all HR orgs
    const hrOrgsResult = await hrPool.query(`
      SELECT id FROM organizations
    `);
    const hrOrgIds = new Set(hrOrgsResult.rows.map(r => r.id));

    // Verify each Payroll user
    for (const payrollUser of payrollUsersResult.rows) {
      if (payrollUser.hr_user_id) {
        result.stats.linkedUsers++;
        
        // Check if hr_user_id exists in HR
        if (!hrUsersMap.has(payrollUser.hr_user_id)) {
          result.stats.invalidHrUserIds++;
          result.errors.push(
            `Payroll user ${payrollUser.email} has invalid hr_user_id: ${payrollUser.hr_user_id}`
          );
        } else {
          const hrUser = hrUsersMap.get(payrollUser.hr_user_id)!;
          
          // Check org_id match
          if (payrollUser.org_id !== hrUser.tenant_id) {
            result.stats.invalidOrgIds++;
            result.errors.push(
              `Payroll user ${payrollUser.email} org_id mismatch: Payroll=${payrollUser.org_id}, HR=${hrUser.tenant_id}`
            );
          }
          
          // Check role mapping
          const expectedRole = mapHrToPayrollRole(hrUser.roles);
          if (payrollUser.payroll_role !== expectedRole) {
            result.stats.roleMismatches++;
            result.warnings.push(
              `Payroll user ${payrollUser.email} role mismatch: Payroll=${payrollUser.payroll_role}, Expected=${expectedRole} (HR roles: ${hrUser.roles.join(', ')})`
            );
          }
        }
      } else {
        result.stats.unlinkedUsers++;
        result.warnings.push(
          `Payroll user ${payrollUser.email} has no hr_user_id`
        );
      }
      
      // Check org_id exists in HR
      if (payrollUser.org_id && !hrOrgIds.has(payrollUser.org_id)) {
        result.stats.invalidOrgIds++;
        result.errors.push(
          `Payroll user ${payrollUser.email} has invalid org_id: ${payrollUser.org_id}`
        );
      }
    }

    // Check payroll_user_ext integrity
    const extResult = await payrollPool.query(`
      SELECT hr_user_id FROM payroll_user_ext
    `);
    
    for (const ext of extResult.rows) {
      if (!hrUsersMap.has(ext.hr_user_id)) {
        result.errors.push(
          `payroll_user_ext has invalid hr_user_id: ${ext.hr_user_id}`
        );
      }
    }

    result.passed = result.errors.length === 0;

  } catch (error) {
    result.passed = false;
    result.errors.push(`Verification failed: ${error.message}`);
  } finally {
    await hrPool.end();
    await payrollPool.end();
  }

  return result;
}

function mapHrToPayrollRole(hrRoles: string[]): 'payroll_admin' | 'payroll_employee' {
  const adminSet = new Set(['CEO', 'Admin', 'HR', 'ceo', 'admin', 'hr']);
  return hrRoles.some(r => adminSet.has(r)) ? 'payroll_admin' : 'payroll_employee';
}

// Run if executed directly
if (require.main === module) {
  verifyIntegrity()
    .then((result) => {
      console.log('\n=== Verification Results ===');
      console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`\nStats:`);
      console.log(`  Total Payroll Users: ${result.stats.totalPayrollUsers}`);
      console.log(`  Linked Users: ${result.stats.linkedUsers}`);
      console.log(`  Unlinked Users: ${result.stats.unlinkedUsers}`);
      console.log(`  Invalid HR User IDs: ${result.stats.invalidHrUserIds}`);
      console.log(`  Invalid Org IDs: ${result.stats.invalidOrgIds}`);
      console.log(`  Role Mismatches: ${result.stats.roleMismatches}`);

      if (result.errors.length > 0) {
        console.log(`\n❌ Errors (${result.errors.length}):`);
        result.errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
        if (result.errors.length > 10) {
          console.log(`  ... and ${result.errors.length - 10} more`);
        }
      }

      if (result.warnings.length > 0) {
        console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
        result.warnings.slice(0, 10).forEach(warn => console.log(`  - ${warn}`));
        if (result.warnings.length > 10) {
          console.log(`  ... and ${result.warnings.length - 10} more`);
        }
      }

      process.exit(result.passed ? 0 : 1);
    })
    .catch((error) => {
      console.error('\n❌ Verification failed:', error);
      process.exit(1);
    });
}

export { verifyIntegrity };




