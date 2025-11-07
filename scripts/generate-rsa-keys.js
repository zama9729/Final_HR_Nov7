/**
 * Generate RSA Key Pair for HR-Payroll SSO
 * 
 * This script generates a RSA-256 key pair for JWT signing between HR and Payroll systems.
 * 
 * Usage: node scripts/generate-rsa-keys.js
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔐 Generating RSA-256 Key Pair for HR-Payroll SSO...\n');

// Generate key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

console.log('✅ Key pair generated successfully!\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📋 PRIVATE KEY (for HR System - HR_PAYROLL_JWT_PRIVATE_KEY):\n');
console.log(privateKey);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📋 PUBLIC KEY (for Payroll System - HR_PAYROLL_JWT_PUBLIC_KEY):\n');
console.log(publicKey);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Save to files
const keysDir = path.join(__dirname, '..', '.keys');
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

const privateKeyPath = path.join(keysDir, 'hr-payroll-private.pem');
const publicKeyPath = path.join(keysDir, 'hr-payroll-public.pem');

fs.writeFileSync(privateKeyPath, privateKey, 'utf8');
fs.writeFileSync(publicKeyPath, publicKey, 'utf8');

console.log('💾 Keys saved to:');
console.log(`   Private: ${privateKeyPath}`);
console.log(`   Public:  ${publicKeyPath}\n`);

console.log('📝 Add to your .env file:\n');
console.log('# HR System (.env)');
console.log('HR_PAYROLL_JWT_PRIVATE_KEY="' + privateKey.replace(/\n/g, '\\n') + '"\n');
console.log('# Payroll System (payroll-app/.env or payroll-api environment)');
console.log('HR_PAYROLL_JWT_PUBLIC_KEY="' + publicKey.replace(/\n/g, '\\n') + '"\n');

console.log('⚠️  IMPORTANT:');
console.log('   1. Keep the private key SECRET - only use it in the HR system');
console.log('   2. The public key can be safely used in the Payroll system');
console.log('   3. Never commit these keys to version control');
console.log('   4. Add .keys/ to your .gitignore\n');

