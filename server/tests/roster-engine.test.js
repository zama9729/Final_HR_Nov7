import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  generateCoverageSlots,
  rotateEmployees,
  assignSlotsToEmployees,
} from '../services/roster-engine.js';

describe('roster engine helpers', () => {
  it('expands coverage plan across range', () => {
    const coverage = [
      {
        day_of_week: [1, 2],
        shift_name: 'Morning',
        start_time: '09:00',
        end_time: '17:00',
        coverage_required: 2,
      },
    ];
    const slots = generateCoverageSlots(coverage, '2025-02-03', '2025-02-04');
    assert.strictEqual(slots.length, 4);
    assert.ok(slots.every((slot) => slot.shiftName === 'Morning'));
  });

  it('rotates employees deterministically', () => {
    const employees = [
      { id: 'a', employee_id: 'E-002' },
      { id: 'b', employee_id: 'E-001' },
      { id: 'c', employee_id: 'E-003' },
    ];
    const defaultOrder = rotateEmployees(employees);
    assert.deepStrictEqual(defaultOrder.map((e) => e.employee_id), ['E-001', 'E-002', 'E-003']);
    const rotated = rotateEmployees(employees, 1);
    assert.deepStrictEqual(rotated.map((e) => e.employee_id), ['E-002', 'E-003', 'E-001']);
  });

  it('assigns slots honoring leave map and rest defaults', () => {
    const coverage = [
      {
        day_of_week: [1],
        shift_name: 'Morning',
        start_time: '09:00',
        end_time: '17:00',
        coverage_required: 2,
      },
    ];
    const slots = generateCoverageSlots(coverage, '2025-02-03', '2025-02-03');
    const employees = [
      { id: 'emp1', employee_id: 'EMP-1' },
      { id: 'emp2', employee_id: 'EMP-2' },
    ];
    const { slots: assignedSlots, summary } = assignSlotsToEmployees(slots, employees, {
      leaveMap: new Map([['emp2', [{ start: new Date('2025-02-03'), end: new Date('2025-02-03') }]]]),
      minRestHours: 8,
      maxConsecutiveNights: 2,
    });
    assert.strictEqual(summary.assignedSlots, 1);
    assert.strictEqual(summary.unassignedSlots, 1);
    assert.strictEqual(assignedSlots.filter((slot) => slot.assignedEmployeeId === 'emp1').length, 1);
  });
});



