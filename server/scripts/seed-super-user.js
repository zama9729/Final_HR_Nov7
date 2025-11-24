import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createPool, query } from '../db/pool.js';

const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) return null;
  return args[index + 1];
};

const email = getArg('--email') || process.env.SUPER_USER_EMAIL;
const password = getArg('--password') || process.env.SUPER_USER_PASSWORD;
const mfaSecret = getArg('--mfa-secret') || process.env.SUPER_USER_MFA_SECRET;

async function main() {
  if (!email || !password || !mfaSecret) {
    console.error('Usage: node server/scripts/seed-super-user.js --email user@example.com --password StrongPass123 --mfa-secret BASE32SECRET');
    process.exit(1);
  }

  await createPool();

  const profileRes = await query('SELECT id FROM profiles WHERE lower(email)=lower($1)', [email]);
  let userId;

  if (profileRes.rows.length === 0) {
    const newIdRes = await query('SELECT gen_random_uuid() AS id');
    userId = newIdRes.rows[0].id;
    await query(
      `INSERT INTO profiles (id, email, first_name, last_name, tenant_id)
       VALUES ($1, $2, $3, $4, NULL)`,
      [userId, email, 'Owner', 'Account', null]
    );
  } else {
    userId = profileRes.rows[0].id;
  }

  const hash = await bcrypt.hash(password, 10);
  await query(
    `INSERT INTO user_auth (user_id, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [userId, hash]
  );

  await query(
    `INSERT INTO user_roles (user_id, role)
     VALUES ($1, 'super_user')
     ON CONFLICT (user_id, role) DO NOTHING`,
    [userId]
  );

  await query(
    `INSERT INTO super_users (user_id, mfa_secret)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET mfa_secret = EXCLUDED.mfa_secret`,
    [userId, mfaSecret]
  );

  console.log(`✅ Super user seeded for ${email}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Failed to seed super user', error);
  process.exit(1);
});


