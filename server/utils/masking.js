/**
 * Masking utilities for PII in offboarding verification
 * Email: first + last char of local and domain shown, rest replaced with *
 * Phone: reveal last 3 digits only
 */

/**
 * Mask an email address
 * @param {string} email - Email to mask
 * @returns {string} Masked email (e.g., "john@example.com" -> "j***n@e***e.com")
 */
export function maskEmail(email) {
  if (!email) return '';
  
  const [local, domain] = email.split('@');
  if (!domain) return email; // Invalid email format
  
  // Mask local part: keep first and last char, mask middle
  let maskedLocal = local;
  if (local.length > 2) {
    maskedLocal = local[0] + '*'.repeat(Math.max(0, local.length - 2)) + local[local.length - 1];
  } else if (local.length === 2) {
    maskedLocal = local[0] + '*';
  }
  
  // Mask domain: keep first and last char of each part
  const domainParts = domain.split('.');
  const maskedDomainParts = domainParts.map(part => {
    if (part.length > 2) {
      return part[0] + '*'.repeat(Math.max(0, part.length - 2)) + part[part.length - 1];
    } else if (part.length === 2) {
      return part[0] + '*';
    }
    return part;
  });
  
  return `${maskedLocal}@${maskedDomainParts.join('.')}`;
}

/**
 * Mask a phone number (reveal last 3 digits only)
 * @param {string} phone - Phone number to mask
 * @returns {string} Masked phone (e.g., "9876543210" -> "*******210")
 */
export function maskPhone(phone) {
  if (!phone) return '';
  
  const phoneStr = String(phone).replace(/\D/g, ''); // Remove non-digits
  if (phoneStr.length <= 3) return phoneStr;
  
  const lastThree = phoneStr.slice(-3);
  const masked = '*'.repeat(phoneStr.length - 3);
  return masked + lastThree;
}

/**
 * Generate a 6-digit OTP
 * @returns {string} 6-digit OTP
 */
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash a string using SHA-256 (for email hashing in retention)
 * @param {string} text - Text to hash
 * @returns {Promise<string>} Hex hash
 */
export async function hashString(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

