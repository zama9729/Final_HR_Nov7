/**
 * Script to fix user role assignment
 * Usage: node server/scripts/fix-user-role.js <email> <correctRole>
 * Example: node server/scripts/fix-user-role.js ss@tg.com hr
 */

import { query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

const email = process.argv[2];
const correctRole = process.argv[3];

if (!email || !correctRole) {
  console.error('Usage: node fix-user-role.js <email> <role>');
  console.error('Example: node fix-user-role.js ss@tg.com hr');
  process.exit(1);
}

const validRoles = ['employee', 'manager', 'hr', 'director', 'ceo', 'admin'];
if (!validRoles.includes(correctRole)) {
  console.error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  process.exit(1);
}

async function fixUserRole() {
  try {
    console.log(`Fixing role for ${email} to ${correctRole}...`);

    // Find user by email
    const userResult = await query(
      'SELECT id, email FROM profiles WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }

    const userId = userResult.rows[0].id;
    console.log(`Found user: ${userResult.rows[0].email} (ID: ${userId})`);

    // Get current roles
    const currentRolesResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [userId]
    );

    const currentRoles = currentRolesResult.rows.map(r => r.role);
    console.log(`Current roles: ${currentRoles.join(', ') || 'none'}`);

    // Get tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      console.error('User has no tenant_id. Cannot proceed.');
      process.exit(1);
    }

    await query('BEGIN');

    try {
      // Remove all existing roles
      await query(
        'DELETE FROM user_roles WHERE user_id = $1',
        [userId]
      );
      console.log('Removed all existing roles');

      // Add correct role
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role) DO NOTHING`,
        [userId, correctRole, tenantId]
      );
      console.log(`Added role: ${correctRole}`);

      await query('COMMIT');
      console.log('✅ Role fixed successfully!');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

    // Verify
    const verifyResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [userId]
    );
    console.log(`Verified roles: ${verifyResult.rows.map(r => r.role).join(', ')}`);

    process.exit(0);
  } catch (error) {
    console.error('Error fixing user role:', error);
    process.exit(1);
  }
}

fixUserRole();

