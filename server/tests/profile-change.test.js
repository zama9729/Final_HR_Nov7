import { describe, it } from 'node:test';
import assert from 'node:assert';
import { query } from '../db/pool.js';

describe('profile change requests', () => {
  it('table exists', async () => {
    const result = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'profile_change_requests'`
    );
    const columnNames = result.rows.map((row) => row.column_name);
    assert(columnNames.includes('employee_id'));
    assert(columnNames.includes('changed_fields'));
    assert(columnNames.includes('status'));
  });
});




