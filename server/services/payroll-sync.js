/**
 * HR-Payroll Synchronization Service
 * 
 * This service handles automatic synchronization between HR and Payroll systems.
 * When a user/profile is created in HR, it automatically creates the corresponding
 * user in Payroll with the correct role mapping.
 */

// Use built-in fetch (Node.js 18+)
// No import needed - fetch is global

const PAYROLL_PROVISION_URL = process.env.PAYROLL_PROVISION_URL || 'http://localhost:4000/api/provision/user';
const PAYROLL_PROVISION_TOKEN = process.env.PAYROLL_PROVISION_TOKEN || 'your-shared-provisioning-secret';

/**
 * Map HR role to Payroll role
 * @param {string} hrRole - HR role (ceo, hr, admin, director, manager, employee)
 * @returns {string} Payroll role (payroll_admin or payroll_employee)
 */
function mapHrToPayrollRole(hrRole) {
  if (!hrRole) return 'payroll_employee';
  
  const hrRoleLower = hrRole.toLowerCase();
  // CEO, HR, Admin -> payroll_admin
  if (['ceo', 'hr', 'admin'].includes(hrRoleLower)) {
    return 'payroll_admin';
  }
  // Director, Manager, Employee -> payroll_employee
  return 'payroll_employee';
}

/**
 * Sync user to Payroll system
 * @param {Object} userData - User data from HR system
 * @param {string} userData.hr_user_id - HR user ID
 * @param {string} userData.email - User email
 * @param {string} userData.first_name - First name
 * @param {string} userData.last_name - Last name
 * @param {string} userData.org_id - Organization ID
 * @param {string} userData.role - HR role (ceo, hr, admin, director, manager, employee)
 * @param {string} [userData.employee_id] - Employee ID from HR
 * @param {string} [userData.department] - Department from HR
 * @param {string} [userData.position] - Position/Designation from HR
 * @param {string} [userData.join_date] - Join date from HR (YYYY-MM-DD format)
 * @returns {Promise<Object>} Payroll sync result
 */
async function syncUserToPayroll(userData) {
  const {
    hr_user_id,
    email,
    first_name,
    last_name,
    org_id,
    role,
    employee_id,
    department,
    position,
    join_date
  } = userData;

  if (!hr_user_id || !email || !org_id) {
    throw new Error('Missing required fields: hr_user_id, email, and org_id are required');
  }

  try {
    const payrollRole = mapHrToPayrollRole(role);
    
    const response = await fetch(PAYROLL_PROVISION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAYROLL_PROVISION_TOKEN}`
      },
      body: JSON.stringify({
        hr_user_id,
        email: email.toLowerCase().trim(),
        first_name: first_name || '',
        last_name: last_name || '',
        org_id,
        payroll_role: payrollRole,
        employee_id: employee_id || null,
        department: department || null,
        designation: position || null, // HR uses 'position', Payroll uses 'designation'
        date_of_joining: join_date || null
      })
      // Note: Timeout handled by fetch implementation or can be added with AbortController
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Payroll sync failed: ${errorData.error || response.statusText}`);
    }

    const result = await response.json();
    console.log(`✅ Synced user to payroll: ${email} (${payrollRole})`);
    return { success: true, ...result };
  } catch (error) {
    // Log error but don't throw - allow HR operation to continue
    console.error(`⚠️  Failed to sync user to payroll (${email}):`, error.message);
    // Return error info instead of throwing
    return { 
      success: false, 
      error: error.message,
      user: { email, hr_user_id, org_id }
    };
  }
}

/**
 * Sync organization to Payroll system
 * @param {Object} orgData - Organization data
 * @param {string} orgData.org_id - Organization ID
 * @param {string} orgData.org_name - Organization name
 * @param {string} orgData.subdomain - Organization subdomain
 * @param {string} orgData.admin_email - Admin user email
 * @returns {Promise<Object>} Payroll provision result
 */
async function syncOrganizationToPayroll(orgData) {
  const {
    org_id,
    org_name,
    subdomain,
    admin_email
  } = orgData;

  if (!org_id || !subdomain) {
    throw new Error('Missing required fields: org_id and subdomain are required');
  }

  try {
    const provisionUrl = PAYROLL_PROVISION_URL.replace('/user', '/tenant');
    
    const response = await fetch(provisionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAYROLL_PROVISION_TOKEN}`
      },
      body: JSON.stringify({
        org_id,
        org_name: org_name || null,
        subdomain: subdomain.toLowerCase(),
        admin_email: admin_email || null
      })
      // Note: Timeout handled by fetch implementation or can be added with AbortController
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Payroll organization provision failed: ${errorData.error || response.statusText}`);
    }

    const result = await response.json();
    console.log(`✅ Provisioned organization to payroll: ${org_name} (${subdomain})`);
    return { success: true, ...result };
  } catch (error) {
    // Log error but don't throw - allow HR operation to continue
    console.error(`⚠️  Failed to provision organization to payroll (${org_name}):`, error.message);
    return { 
      success: false, 
      error: error.message,
      organization: { org_id, org_name, subdomain }
    };
  }
}

/**
 * Sync user with retry logic
 * @param {Object} userData - User data
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Object>} Sync result
 */
async function syncUserToPayrollWithRetry(userData, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await syncUserToPayroll(userData);
      if (result.success !== false) {
        return result;
      }
      lastError = result.error;
    } catch (error) {
      lastError = error.message;
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  return {
    success: false,
    error: `Failed after ${maxRetries} attempts: ${lastError}`,
    user: userData
  };
}

export {
  syncUserToPayroll,
  syncOrganizationToPayroll,
  syncUserToPayrollWithRetry,
  mapHrToPayrollRole
};

