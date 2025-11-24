import { createPool, query } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

async function listEmails() {
  try {
    // Initialize database connection
    await createPool();
    console.log('📧 Fetching all emails from the system...\n');

    // Query all profiles with their associated information
    const result = await query(`
      SELECT 
        p.id,
        p.email,
        p.first_name,
        p.last_name,
        p.phone,
        p.tenant_id,
        o.name as organization_name,
        ARRAY_AGG(DISTINCT ur.role) FILTER (WHERE ur.role IS NOT NULL) as roles,
        e.employee_id,
        e.department,
        e.position,
        e.status as employee_status,
        p.created_at
      FROM profiles p
      LEFT JOIN organizations o ON o.id = p.tenant_id
      LEFT JOIN user_roles ur ON ur.user_id = p.id
      LEFT JOIN employees e ON e.user_id = p.id
      WHERE p.email IS NOT NULL
      GROUP BY p.id, p.email, p.first_name, p.last_name, p.phone, p.tenant_id, o.name, e.employee_id, e.department, e.position, e.status, p.created_at
      ORDER BY p.created_at DESC
    `);

    if (result.rows.length === 0) {
      console.log('❌ No emails found in the system.');
      return;
    }

    console.log(`✅ Found ${result.rows.length} email(s) in the system:\n`);
    console.log('='.repeat(100));
    
    result.rows.forEach((row, index) => {
      // Handle PostgreSQL array format - it might be a string or array
      let rolesArray = [];
      if (row.roles) {
        if (Array.isArray(row.roles)) {
          rolesArray = row.roles;
        } else if (typeof row.roles === 'string') {
          // PostgreSQL array string format: {role1,role2}
          rolesArray = row.roles.replace(/[{}]/g, '').split(',').filter(r => r);
        }
      }
      
      console.log(`\n${index + 1}. Email: ${row.email}`);
      console.log(`   Name: ${row.first_name || 'N/A'} ${row.last_name || ''}`.trim());
      console.log(`   Phone: ${row.phone || 'N/A'}`);
      console.log(`   Organization: ${row.organization_name || 'N/A'}`);
      console.log(`   Roles: ${rolesArray.length > 0 ? rolesArray.join(', ') : 'N/A'}`);
      if (row.employee_id) {
        console.log(`   Employee ID: ${row.employee_id}`);
        console.log(`   Department: ${row.department || 'N/A'}`);
        console.log(`   Position: ${row.position || 'N/A'}`);
        console.log(`   Status: ${row.employee_status || 'N/A'}`);
      } else {
        console.log(`   Employee Record: Not created`);
      }
      console.log(`   Created: ${new Date(row.created_at).toLocaleString()}`);
      console.log(`   User ID: ${row.id}`);
    });

    console.log('\n' + '='.repeat(100));
    console.log(`\n📊 Summary:`);
    console.log(`   Total emails: ${result.rows.length}`);
    
    // Count by organization
    const orgCounts = {};
    result.rows.forEach(row => {
      const orgName = row.organization_name || 'No Organization';
      orgCounts[orgName] = (orgCounts[orgName] || 0) + 1;
    });
    
    console.log(`   By organization:`);
    Object.entries(orgCounts).forEach(([org, count]) => {
      console.log(`     - ${org}: ${count}`);
    });

    // Count by role
    const roleCounts = {};
    result.rows.forEach(row => {
      let rolesArray = [];
      if (row.roles) {
        if (Array.isArray(row.roles)) {
          rolesArray = row.roles;
        } else if (typeof row.roles === 'string') {
          rolesArray = row.roles.replace(/[{}]/g, '').split(',').filter(r => r);
        }
      }
      
      if (rolesArray.length > 0) {
        rolesArray.forEach(role => {
          roleCounts[role] = (roleCounts[role] || 0) + 1;
        });
      } else {
        roleCounts['No Role'] = (roleCounts['No Role'] || 0) + 1;
      }
    });
    
    console.log(`   By role:`);
    Object.entries(roleCounts).forEach(([role, count]) => {
      console.log(`     - ${role}: ${count}`);
    });

    // Export to CSV option
    console.log(`\n💡 Tip: You can also query the database directly with:`);
    console.log(`   SELECT email, first_name, last_name, tenant_id FROM profiles ORDER BY created_at DESC;`);

  } catch (error) {
    console.error('❌ Error fetching emails:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

listEmails();

