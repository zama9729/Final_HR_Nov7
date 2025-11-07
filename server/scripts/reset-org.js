import { createPool, query } from '../db/pool.js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function resetOrg(orgSlug, confirmPassphrase) {
  try {
    await createPool();
    console.log('✅ Connected to database');

    // Get org by slug
    const orgResult = await query(
      'SELECT id, name, slug FROM organizations WHERE slug = $1',
      [orgSlug]
    );

    if (orgResult.rows.length === 0) {
      console.error(`❌ Organization with slug "${orgSlug}" not found`);
      process.exit(1);
    }

    const org = orgResult.rows[0];

    console.log(`\n⚠️  WARNING: This will DELETE all data for organization: ${org.name} (${org.slug})`);
    console.log('This includes:');
    console.log('  - Promotion evaluations and cycles');
    console.log('  - Employee policies and org policies');
    console.log('  - Audit logs');
    console.log('  - Invite tokens');
    console.log('\nThis action CANNOT be undone!\n');

    // Confirm
    const confirm = await question('Type "RESET" to confirm: ');
    if (confirm !== 'RESET') {
      console.log('❌ Reset cancelled');
      process.exit(0);
    }

    // Verify passphrase if set
    const passphrase = process.env.ORG_RESET_CONFIRM;
    if (passphrase) {
      const providedPassphrase = confirmPassphrase || await question('Enter reset passphrase: ');
      if (providedPassphrase !== passphrase) {
        console.error('❌ Invalid passphrase');
        process.exit(1);
      }
    }

    console.log('\n🔄 Starting reset...');

    // Start transaction
    await query('BEGIN');

    try {
      // Delete in order (respect FK constraints)
      console.log('  Deleting promotion evaluations...');
      await query(
        `DELETE FROM promotion_evaluations 
         WHERE cycle_id IN (SELECT id FROM promotion_cycles WHERE org_id = $1)`,
        [org.id]
      );

      console.log('  Deleting promotion cycles...');
      await query('DELETE FROM promotion_cycles WHERE org_id = $1', [org.id]);

      console.log('  Deleting employee policies...');
      await query(
        `DELETE FROM employee_policies 
         WHERE user_id IN (SELECT id FROM profiles WHERE tenant_id = $1)`,
        [org.id]
      );

      console.log('  Deleting org policies...');
      await query('DELETE FROM org_policies WHERE org_id = $1', [org.id]);

      console.log('  Deleting audit logs...');
      await query('DELETE FROM audit_logs WHERE org_id = $1', [org.id]);

      console.log('  Deleting invite tokens...');
      await query('DELETE FROM invite_tokens WHERE org_id = $1', [org.id]);

      // Log audit (before deleting audit_logs)
      await query(
        `INSERT INTO audit_logs (org_id, actor_user_id, action, object_type, object_id, payload)
         VALUES ($1, NULL, $2, $3, $4, $5)`,
        [
          org.id,
          'reset',
          'organization',
          org.id,
          JSON.stringify({ 
            org_name: org.name,
            org_slug: org.slug,
            reset_by: 'CLI',
            timestamp: new Date().toISOString()
          })
        ]
      );

      await query('COMMIT');

      console.log(`\n✅ Organization ${org.name} data has been reset successfully`);
      console.log(`   Org ID: ${org.id}`);
      console.log(`   Reset at: ${new Date().toISOString()}`);
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Get slug from command line args
const args = process.argv.slice(2);
const orgSlug = args.find(arg => arg.startsWith('--org='))?.split('=')[1] || args[0];
const passphrase = args.find(arg => arg.startsWith('--passphrase='))?.split('=')[1];

if (!orgSlug) {
  console.error('Usage: node reset-org.js --org=<slug> [--passphrase=<passphrase>]');
  console.error('   or: node reset-org.js <slug>');
  process.exit(1);
}

resetOrg(orgSlug, passphrase);

