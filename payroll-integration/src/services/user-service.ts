/**
 * User Service for Payroll Application
 * 
 * Handles user auto-provisioning and management from HR SSO
 * 
 * Usage:
 *   import { upsertPayrollUser, getPayrollUserByHrId } from './services/user-service';
 */

import { Pool } from 'pg';
import { HrUser } from '../middleware/sso';

const pool = new Pool({
  connectionString: process.env.PAYROLL_DB_URL || process.env.DATABASE_URL,
});

export interface PayrollUser {
  id: string;
  email: string;
  hr_user_id: string;
  org_id: string;
  payroll_role: 'payroll_admin' | 'payroll_employee';
  first_name?: string;
  last_name?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Upsert Payroll user from HR SSO data
 * 
 * - If user exists by hr_user_id, update it
 * - If user exists by email (but no hr_user_id), link it
 * - If user doesn't exist, create it
 */
export async function upsertPayrollUser(hrUser: HrUser): Promise<PayrollUser> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if user exists by hr_user_id
    let userResult = await client.query(
      `SELECT id, email, hr_user_id, org_id, payroll_role, first_name, last_name
       FROM users
       WHERE hr_user_id = $1`,
      [hrUser.hrUserId]
    );
    
    let user: PayrollUser;
    
    if (userResult.rows.length > 0) {
      // Update existing user
      user = userResult.rows[0];
      
      const nameParts = hrUser.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      await client.query(
        `UPDATE users
         SET 
           email = $1,
           org_id = $2,
           payroll_role = $3,
           first_name = COALESCE($4, first_name),
           last_name = COALESCE($5, last_name),
           updated_at = now()
         WHERE hr_user_id = $6
         RETURNING id, email, hr_user_id, org_id, payroll_role, first_name, last_name`,
        [
          hrUser.email,
          hrUser.orgId,
          hrUser.payrollRole,
          firstName,
          lastName,
          hrUser.hrUserId
        ]
      );
      
      // Re-fetch to get updated data
      userResult = await client.query(
        `SELECT id, email, hr_user_id, org_id, payroll_role, first_name, last_name
         FROM users
         WHERE hr_user_id = $1`,
        [hrUser.hrUserId]
      );
      
      user = userResult.rows[0];
      
      console.log(`✓ Updated Payroll user: ${user.email} (${user.payroll_role})`);
    } else {
      // Check if user exists by email (for linking existing users)
      const emailResult = await client.query(
        `SELECT id, email, hr_user_id, org_id, payroll_role
         FROM users 
         WHERE email = $1`,
        [hrUser.email]
      );
      
      if (emailResult.rows.length > 0) {
        // Link existing user by email
        const existingUser = emailResult.rows[0];
        
        if (existingUser.hr_user_id && existingUser.hr_user_id !== hrUser.hrUserId) {
          console.warn(`⚠️  User ${hrUser.email} already linked to different HR user: ${existingUser.hr_user_id}`);
          // Continue with update (prefer HR's mapping)
        }
        
        const nameParts = hrUser.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        await client.query(
          `UPDATE users
           SET 
             hr_user_id = $1,
             org_id = $2,
             payroll_role = $3,
             first_name = COALESCE($4, first_name),
             last_name = COALESCE($5, last_name),
             updated_at = now()
           WHERE email = $6
           RETURNING id, email, hr_user_id, org_id, payroll_role, first_name, last_name`,
          [
            hrUser.hrUserId,
            hrUser.orgId,
            hrUser.payrollRole,
            firstName,
            lastName,
            hrUser.email
          ]
        );
        
        // Re-fetch to get updated data
        userResult = await client.query(
          `SELECT id, email, hr_user_id, org_id, payroll_role, first_name, last_name
           FROM users
           WHERE hr_user_id = $1`,
          [hrUser.hrUserId]
        );
        
        user = userResult.rows[0];
        
        console.log(`✓ Linked Payroll user: ${user.email} → HR ID: ${hrUser.hrUserId} (${user.payroll_role})`);
      } else {
        // Create new user
        const nameParts = hrUser.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        const insertResult = await client.query(
          `INSERT INTO users (
            hr_user_id, email, org_id, payroll_role, first_name, last_name
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, email, hr_user_id, org_id, payroll_role, first_name, last_name`,
          [
            hrUser.hrUserId,
            hrUser.email,
            hrUser.orgId,
            hrUser.payrollRole,
            firstName,
            lastName
          ]
        );
        
        user = insertResult.rows[0];
        
        console.log(`✓ Created Payroll user: ${user.email} (${user.payroll_role})`);
      }
    }
    
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error upserting Payroll user:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get Payroll user by HR user ID
 */
export async function getPayrollUserByHrId(hrUserId: string): Promise<PayrollUser | null> {
  const result = await pool.query(
    `SELECT id, email, hr_user_id, org_id, payroll_role, first_name, last_name
     FROM users
     WHERE hr_user_id = $1`,
    [hrUserId]
  );
  
  return result.rows[0] || null;
}

/**
 * Get Payroll user by email
 */
export async function getPayrollUserByEmail(email: string): Promise<PayrollUser | null> {
  const result = await pool.query(
    `SELECT id, email, hr_user_id, org_id, payroll_role, first_name, last_name
     FROM users
     WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  
  return result.rows[0] || null;
}

/**
 * Get Payroll user by Payroll user ID
 */
export async function getPayrollUserById(userId: string): Promise<PayrollUser | null> {
  const result = await pool.query(
    `SELECT id, email, hr_user_id, org_id, payroll_role, first_name, last_name
     FROM users
     WHERE id = $1`,
    [userId]
  );
  
  return result.rows[0] || null;
}

/**
 * Update Payroll user role
 */
export async function updatePayrollUserRole(
  userId: string,
  payrollRole: 'payroll_admin' | 'payroll_employee'
): Promise<PayrollUser> {
  const result = await pool.query(
    `UPDATE users
     SET payroll_role = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, email, hr_user_id, org_id, payroll_role, first_name, last_name`,
    [payrollRole, userId]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`User not found: ${userId}`);
  }
  
  return result.rows[0];
}


