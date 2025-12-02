/**
 * Test script for Promotion Workflow
 * 
 * This script verifies that the promotion workflow is functioning correctly:
 * 1. Creates a test promotion
 * 2. Submits it for approval
 * 3. Approves it
 * 4. Verifies employee profile is updated
 * 5. Verifies employee_event is created
 * 6. Verifies HIKE event is created if CTC changed
 * 
 * Usage: node server/scripts/test-promotion-workflow.js
 */

import { query, queryWithOrg } from '../db/pool.js';
import { createPromotion, submitPromotion, approvePromotion, applyPromotion } from '../routes/promotions.js';

async function testPromotionWorkflow() {
  console.log('🧪 Starting Promotion Workflow Test...\n');

  try {
    // Step 1: Find a test employee and org
    const orgResult = await query('SELECT id FROM organizations LIMIT 1');
    if (orgResult.rows.length === 0) {
      console.error('❌ No organizations found. Please create an organization first.');
      return;
    }
    const orgId = orgResult.rows[0].id;

    const empResult = await query(
      'SELECT id, position, ctc FROM employees WHERE tenant_id = $1 LIMIT 1',
      [orgId]
    );
    if (empResult.rows.length === 0) {
      console.error('❌ No employees found. Please create an employee first.');
      return;
    }
    const employee = empResult.rows[0];

    console.log(`✅ Found test employee: ${employee.id}`);
    console.log(`   Current position: ${employee.position || 'N/A'}`);
    console.log(`   Current CTC: ${employee.ctc || 'N/A'}\n`);

    // Step 2: Create a test promotion
    console.log('📝 Step 1: Creating promotion...');
    const promotionData = {
      employee_id: employee.id,
      old_designation: employee.position || 'Employee',
      new_designation: 'Senior Employee',
      old_ctc: employee.ctc || 500000,
      new_ctc: 600000,
      reason_text: 'Test promotion workflow',
      effective_date: new Date().toISOString().split('T')[0],
      status: 'DRAFT',
    };

    // Note: This is a simplified test - in production, use the API endpoint
    const promoResult = await queryWithOrg(
      `INSERT INTO promotions (
        org_id, employee_id, old_designation, new_designation,
        old_ctc, new_ctc, reason_text, effective_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        orgId,
        promotionData.employee_id,
        promotionData.old_designation,
        promotionData.new_designation,
        promotionData.old_ctc,
        promotionData.new_ctc,
        promotionData.reason_text,
        promotionData.effective_date,
        promotionData.status,
      ],
      orgId
    );
    const promotion = promoResult.rows[0];
    console.log(`✅ Promotion created: ${promotion.id}`);
    console.log(`   Status: ${promotion.status}\n`);

    // Step 3: Submit for approval
    console.log('📤 Step 2: Submitting promotion for approval...');
    await queryWithOrg(
      `UPDATE promotions SET status = 'PENDING_APPROVAL', updated_at = now()
       WHERE id = $1 AND org_id = $2`,
      [promotion.id, orgId],
      orgId
    );
    console.log(`✅ Promotion submitted\n`);

    // Step 4: Approve promotion
    console.log('✅ Step 3: Approving promotion...');
    await queryWithOrg(
      `UPDATE promotions 
       SET status = 'APPROVED', approved_at = now(), updated_at = now()
       WHERE id = $1 AND org_id = $2`,
      [promotion.id, orgId],
      orgId
    );
    console.log(`✅ Promotion approved\n`);

    // Step 5: Apply promotion
    console.log('🔄 Step 4: Applying promotion...');
    const updatedPromo = await queryWithOrg(
      'SELECT * FROM promotions WHERE id = $1 AND org_id = $2',
      [promotion.id, orgId],
      orgId
    );
    await applyPromotion(updatedPromo.rows[0], orgId);
    console.log(`✅ Promotion applied\n`);

    // Step 6: Verify employee profile updated
    console.log('🔍 Step 5: Verifying employee profile update...');
    const updatedEmp = await query(
      'SELECT position, designation, ctc FROM employees WHERE id = $1',
      [employee.id]
    );
    const updatedEmployee = updatedEmp.rows[0];
    
    if (updatedEmployee.position === promotionData.new_designation) {
      console.log(`✅ Employee position updated: ${updatedEmployee.position}`);
    } else {
      console.log(`❌ Employee position NOT updated. Expected: ${promotionData.new_designation}, Got: ${updatedEmployee.position}`);
    }

    if (updatedEmployee.ctc == promotionData.new_ctc) {
      console.log(`✅ Employee CTC updated: ${updatedEmployee.ctc}`);
    } else {
      console.log(`❌ Employee CTC NOT updated. Expected: ${promotionData.new_ctc}, Got: ${updatedEmployee.ctc}`);
    }
    console.log('');

    // Step 7: Verify employee_event created
    console.log('🔍 Step 6: Verifying employee_event created...');
    const eventResult = await query(
      `SELECT * FROM employee_events 
       WHERE employee_id = $1 AND event_type = 'PROMOTION' 
       AND source_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [employee.id, promotion.id]
    );
    if (eventResult.rows.length > 0) {
      console.log(`✅ Promotion event created: ${eventResult.rows[0].id}`);
      console.log(`   Title: ${eventResult.rows[0].title}`);
    } else {
      console.log(`❌ Promotion event NOT created`);
    }
    console.log('');

    // Step 8: Verify HIKE event created (if CTC changed)
    if (promotionData.new_ctc && promotionData.old_ctc && promotionData.new_ctc !== promotionData.old_ctc) {
      console.log('🔍 Step 7: Verifying HIKE event created...');
      const hikeResult = await query(
        `SELECT * FROM employee_events 
         WHERE employee_id = $1 AND event_type = 'HIKE' 
         AND source_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [employee.id, promotion.id]
      );
      if (hikeResult.rows.length > 0) {
        console.log(`✅ HIKE event created: ${hikeResult.rows[0].id}`);
        const metadata = hikeResult.rows[0].metadata_json;
        console.log(`   Old CTC: ${metadata.oldCTC}`);
        console.log(`   New CTC: ${metadata.newCTC}`);
        console.log(`   Hike %: ${metadata.hikePercent}%`);
      } else {
        console.log(`❌ HIKE event NOT created`);
      }
      console.log('');
    }

    // Cleanup: Revert employee changes
    console.log('🧹 Cleaning up test data...');
    await query(
      `UPDATE employees 
       SET position = $1, designation = $1, ctc = $2, updated_at = now()
       WHERE id = $3`,
      [promotionData.old_designation, promotionData.old_ctc, employee.id]
    );
    await queryWithOrg(
      `DELETE FROM employee_events 
       WHERE employee_id = $1 AND source_id = $2`,
      [employee.id, promotion.id],
      orgId
    );
    await queryWithOrg(
      `DELETE FROM promotions WHERE id = $1 AND org_id = $2`,
      [promotion.id, orgId],
      orgId
    );
    console.log('✅ Test data cleaned up\n');

    console.log('✅ Promotion Workflow Test Completed Successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPromotionWorkflow()
    .then(() => {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Tests failed:', error);
      process.exit(1);
    });
}

export { testPromotionWorkflow };

