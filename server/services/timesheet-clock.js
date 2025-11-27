export function normalizeTimestamp(input) {
  if (!input) return new Date();
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function calculateDurationHours(clockInTs, clockOutTs) {
  const start = new Date(clockInTs).getTime();
  const end = new Date(clockOutTs).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return 0;
  }
  const diffMs = end - start;
  const hours = diffMs / (1000 * 60 * 60);
  return Number(hours.toFixed(2));
}

export function validateClockAction(lastEvent, action) {
  if (!['in', 'out'].includes(action)) {
    return { ok: false, message: 'action must be "in" or "out"' };
  }
  if (!lastEvent) {
    if (action === 'out') {
      return { ok: false, message: 'Clock-in required before clock-out' };
    }
    return { ok: true };
  }

  if (lastEvent.event_type === action && lastEvent.is_open) {
    return { ok: false, message: `Already clocked-${action}` };
  }

  if (action === 'out' && lastEvent.event_type === 'out') {
    return { ok: false, message: 'Clock-in required before clock-out' };
  }

  return { ok: true };
}

export function parseMonthInput(input) {
  if (!input) return null;
  const normalized = `${input}`.trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return null;
  }
  const date = new Date(`${normalized}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export function normalizeCoordinate(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num;
}

