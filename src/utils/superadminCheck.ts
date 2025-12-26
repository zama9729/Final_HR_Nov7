/**
 * Check if current user is a superadmin
 * This checks both frontend env var and can fallback to backend check
 */
export function isSuperAdmin(userEmail: string | null | undefined): boolean {
  if (!userEmail) return false;
  
  const adminEmailsEnv = import.meta.env.VITE_ADMIN_EMAILS || '';
  const adminEmails = adminEmailsEnv
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
  
  const userEmailLower = userEmail.toLowerCase();
  const isAdmin = adminEmails.includes(userEmailLower);
  
  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[SuperAdmin Check]', {
      userEmail,
      userEmailLower,
      adminEmailsEnv,
      adminEmails,
      isAdmin,
      envVar: import.meta.env.VITE_ADMIN_EMAILS
    });
  }
  
  return isAdmin;
}

