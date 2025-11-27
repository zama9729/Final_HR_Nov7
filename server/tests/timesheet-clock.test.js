import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateDurationHours,
  normalizeTimestamp,
  validateClockAction,
  parseMonthInput,
} from '../services/timesheet-clock.js';

describe('timesheet clock helpers', () => {
  it('calculates positive durations', () => {
    const start = '2025-01-01T09:00:00Z';
    const end = '2025-01-01T17:30:00Z';
    const hours = calculateDurationHours(start, end);
    assert.strictEqual(hours, 8.5);
  });

  it('returns 0 for invalid duration', () => {
    const hours = calculateDurationHours('2025-01-01T10:00:00Z', '2025-01-01T09:00:00Z');
    assert.strictEqual(hours, 0);
  });

  it('normalizes timestamps', () => {
    const ts = normalizeTimestamp('2025-01-01T00:00:00Z');
    assert.ok(ts instanceof Date);
    assert.strictEqual(ts.toISOString(), '2025-01-01T00:00:00.000Z');
    const invalid = normalizeTimestamp('bad-value');
    assert.strictEqual(invalid, null);
  });

  it('validates clock actions', () => {
    const noEvent = validateClockAction(null, 'in');
    assert.ok(noEvent.ok);
    const invalidOut = validateClockAction(null, 'out');
    assert.ok(!invalidOut.ok);
    const duplicateIn = validateClockAction({ event_type: 'in', is_open: true }, 'in');
    assert.ok(!duplicateIn.ok);
  });

  it('parses month input', () => {
    const month = parseMonthInput('2025-02');
    assert.ok(month instanceof Date);
    assert.strictEqual(month.toISOString().slice(0, 7), '2025-02');
    const invalid = parseMonthInput('foo');
    assert.strictEqual(invalid, null);
  });
});

