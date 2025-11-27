/**
 * Rule Engine for Staff Scheduling
 * Evaluates hard and soft constraints on schedules
 */

/**
 * Rule types and their evaluation functions
 */
export class RuleEngine {
  constructor(rules = []) {
    this.rules = rules;
  }

  /**
   * Evaluate all rules on a schedule
   * @param {Object} schedule - The schedule to evaluate
   * @param {Array} assignments - Array of schedule assignments
   * @param {Object} context - Additional context (employees, templates, etc.)
   * @returns {Object} - { hardViolations: [], softViolations: [], score: number }
   */
  evaluate(schedule, assignments, context) {
    const hardViolations = [];
    const softViolations = [];
    let totalScore = 0;

    for (const rule of this.rules) {
      try {
        const result = this.evaluateRule(rule, schedule, assignments, context);
        
        if (rule.type === 'hard') {
          if (!result.passed) {
            hardViolations.push({
              ruleId: rule.id,
              ruleName: rule.name,
              message: result.message || `Hard constraint violated: ${rule.name}`,
              details: result.details || {}
            });
          }
        } else {
          // Soft constraint
          const penalty = result.penalty || 0;
          if (penalty > 0) {
            softViolations.push({
              ruleId: rule.id,
              ruleName: rule.name,
              weight: rule.weight || 1,
              penalty,
              message: result.message || `Soft constraint penalty: ${rule.name}`,
              details: result.details || {}
            });
          }
          totalScore += penalty * (rule.weight || 1);
        }
      } catch (error) {
        console.error(`Error evaluating rule ${rule.id}:`, error);
        if (rule.type === 'hard') {
          hardViolations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            message: `Error evaluating rule: ${error.message}`,
            error: true
          });
        }
      }
    }

    return {
      hardViolations,
      softViolations,
      score: totalScore,
      isValid: hardViolations.length === 0
    };
  }

  /**
   * Evaluate a single rule
   */
  evaluateRule(rule, schedule, assignments, context) {
    // Try to get rule function by ID first, then by name (for backward compatibility)
    const ruleFunction = this.getRuleFunction(rule.type, rule.id || rule.name);
    if (!ruleFunction) {
      throw new Error(`Unknown rule: ${rule.id || rule.name}`);
    }

    return ruleFunction(rule, schedule, assignments, context);
  }

  /**
   * Get the evaluation function for a rule
   * Looks up by rule ID (preferred) or rule name (fallback)
   */
  getRuleFunction(ruleType, ruleIdentifier) {
    const ruleMap = {
      hard: {
        'max_night_shifts_per_week': evaluateMaxNightShiftsPerWeek,
        'min_rest_hours_between_shifts': evaluateMinRestHours,
        'max_consecutive_work_days': evaluateMaxConsecutiveDays,
        'max_consecutive_nights': evaluateMaxConsecutiveNights,
        'required_skill_coverage': evaluateRequiredSkillCoverage,
        'no_blackout_assignments': evaluateNoBlackoutAssignments,
        'pinned_shifts_required': evaluatePinnedShiftsRequired,
        'demand_fulfillment': evaluateDemandFulfillment,
        // Also support display names for backward compatibility
        'Maximum Night Shifts Per Week': evaluateMaxNightShiftsPerWeek,
        'Minimum Rest Between Shifts': evaluateMinRestHours,
        'Maximum Consecutive Work Days': evaluateMaxConsecutiveDays,
        'Maximum Consecutive Nights': evaluateMaxConsecutiveNights,
        'Respect Blackout Periods': evaluateNoBlackoutAssignments,
        'Assign Pinned Shifts': evaluatePinnedShiftsRequired,
      },
      soft: {
        'employee_shift_preferences': evaluateEmployeePreferences,
        'minimize_shift_changes': evaluateMinimizeShiftChanges,
        'balance_total_hours': evaluateBalanceTotalHours,
        'prefer_consecutive_shifts': evaluatePreferConsecutiveShifts,
        'avoid_split_weekends': evaluateAvoidSplitWeekends,
        // Also support display names for backward compatibility
        'Honor Employee Preferences': evaluateEmployeePreferences,
        'Balance Work Hours': evaluateBalanceTotalHours,
        'Avoid Split Weekends': evaluateAvoidSplitWeekends,
      }
    };

    const typeMap = ruleMap[ruleType];
    if (!typeMap) {
      return null;
    }

    // Try exact match first
    if (typeMap[ruleIdentifier]) {
      return typeMap[ruleIdentifier];
    }

    // Try case-insensitive match
    const lowerIdentifier = ruleIdentifier?.toLowerCase();
    for (const [key, func] of Object.entries(typeMap)) {
      if (key.toLowerCase() === lowerIdentifier) {
        return func;
      }
    }

    return null;
  }
}

// ========== HARD CONSTRAINT EVALUATORS ==========

/**
 * Rule: max_night_shifts_per_week
 * Ensures no employee has more than max_night_shifts night shifts in a week
 */
function evaluateMaxNightShiftsPerWeek(rule, schedule, assignments, context) {
  const maxShifts = rule.params?.max_shifts || 1;
  const exceptions = context.exceptions || [];
  
  const employeeNightShifts = {};
  
  for (const assignment of assignments) {
    const template = context.templates?.find(t => t.id === assignment.shift_template_id);
    if (template?.shift_type === 'night') {
      employeeNightShifts[assignment.employee_id] = 
        (employeeNightShifts[assignment.employee_id] || 0) + 1;
    }
  }

  const violations = [];
  for (const [employeeId, count] of Object.entries(employeeNightShifts)) {
    // Check if there's an approved exception
    const hasException = exceptions.some(
      e => e.employee_id === employeeId && 
           e.rule_id === rule.id && 
           e.status === 'approved'
    );
    
    if (count > maxShifts && !hasException) {
      violations.push({
        employee_id: employeeId,
        actual: count,
        max: maxShifts
      });
    }
  }

  return {
    passed: violations.length === 0,
    message: violations.length > 0 
      ? `${violations.length} employee(s) exceed max night shifts (${maxShifts})`
      : 'All employees within night shift limit',
    details: { violations }
  };
}

/**
 * Rule: min_rest_hours_between_shifts
 * Ensures minimum rest hours between consecutive shifts
 */
function evaluateMinRestHours(rule, schedule, assignments, context) {
  const minHours = rule.params?.min_hours || 11;
  const violations = [];

  // Group assignments by employee
  const byEmployee = {};
  for (const assignment of assignments) {
    if (!byEmployee[assignment.employee_id]) {
      byEmployee[assignment.employee_id] = [];
    }
    byEmployee[assignment.employee_id].push(assignment);
  }

  for (const [employeeId, empAssignments] of Object.entries(byEmployee)) {
    // Sort by date and time
    empAssignments.sort((a, b) => {
      const dateA = new Date(`${a.shift_date}T${a.end_time}`);
      const dateB = new Date(`${b.shift_date}T${b.end_time}`);
      return dateA - dateB;
    });

    for (let i = 0; i < empAssignments.length - 1; i++) {
      const current = empAssignments[i];
      const next = empAssignments[i + 1];
      
      const endTime = new Date(`${current.shift_date}T${current.end_time}`);
      const startTime = new Date(`${next.shift_date}T${next.start_time}`);
      
      const restHours = (startTime - endTime) / (1000 * 60 * 60);
      
      if (restHours < minHours) {
        violations.push({
          employee_id: employeeId,
          first_shift: { date: current.shift_date, end: current.end_time },
          second_shift: { date: next.shift_date, start: next.start_time },
          rest_hours: restHours.toFixed(2),
          required: minHours
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    message: violations.length > 0
      ? `${violations.length} violation(s) of minimum rest hours (${minHours}h)`
      : 'All shifts meet minimum rest requirements',
    details: { violations }
  };
}

/**
 * Rule: max_consecutive_work_days
 * Ensures no employee works more than max consecutive days
 */
function evaluateMaxConsecutiveDays(rule, schedule, assignments, context) {
  const maxDays = rule.params?.max_days || 6;
  const violations = [];

  const byEmployee = {};
  for (const assignment of assignments) {
    if (!byEmployee[assignment.employee_id]) {
      byEmployee[assignment.employee_id] = new Set();
    }
    byEmployee[assignment.employee_id].add(assignment.shift_date);
  }

  for (const [employeeId, dates] of Object.entries(byEmployee)) {
    const sortedDates = Array.from(dates).sort().map(d => new Date(d));
    
    let consecutive = 1;
    let maxConsecutive = 1;
    
    for (let i = 1; i < sortedDates.length; i++) {
      const daysDiff = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
      if (daysDiff === 1) {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 1;
      }
    }

    if (maxConsecutive > maxDays) {
      violations.push({
        employee_id: employeeId,
        consecutive_days: maxConsecutive,
        max: maxDays
      });
    }
  }

  return {
    passed: violations.length === 0,
    message: violations.length > 0
      ? `${violations.length} employee(s) exceed max consecutive days (${maxDays})`
      : 'All employees within consecutive day limit',
    details: { violations }
  };
}

/**
 * Rule: max_consecutive_nights
 * Ensures no employee works more than the configured number of consecutive night shifts
 */
function evaluateMaxConsecutiveNights(rule, schedule, assignments, context) {
  const maxNights = rule.params?.max_nights || rule.params?.max_days || rule.params?.max || 2;
  const violations = [];
  const templateMap = new Map((context.templates || []).map((t) => [t.id, t]));

  const byEmployee = {};
  for (const assignment of assignments) {
    const template = templateMap.get(assignment.shift_template_id);
    if (template?.shift_type !== 'night') continue;
    if (!byEmployee[assignment.employee_id]) {
      byEmployee[assignment.employee_id] = [];
    }
    byEmployee[assignment.employee_id].push(assignment);
  }

  for (const [employeeId, empAssignments] of Object.entries(byEmployee)) {
    empAssignments.sort((a, b) => new Date(a.shift_date) - new Date(b.shift_date));

    let consecutive = 0;
    let lastDate = null;

    for (const assignment of empAssignments) {
      const currentDate = new Date(assignment.shift_date);
      if (lastDate && (currentDate - lastDate) / (1000 * 60 * 60 * 24) === 1) {
        consecutive += 1;
      } else {
        consecutive = 1;
      }
      lastDate = currentDate;

      if (consecutive > maxNights) {
        violations.push({
          employee_id: employeeId,
          streak: consecutive,
          max: maxNights,
          date: assignment.shift_date,
        });
        break;
      }
    }
  }

  return {
    passed: violations.length === 0,
    message:
      violations.length > 0
        ? `${violations.length} employee(s) exceed max consecutive night shifts (${maxNights})`
        : 'All employees within consecutive night limit',
    details: { violations },
  };
}

/**
 * Rule: required_skill_coverage
 * Ensures shifts have required skill coverage
 */
function evaluateRequiredSkillCoverage(rule, schedule, assignments, context) {
  const requiredSkills = rule.params?.required_skills || {};
  const violations = [];

  // Group assignments by shift template and date
  const byShiftAndDate = {};
  for (const assignment of assignments) {
    const key = `${assignment.shift_template_id}_${assignment.shift_date}`;
    if (!byShiftAndDate[key]) {
      byShiftAndDate[key] = [];
    }
    byShiftAndDate[key].push(assignment);
  }

  // Check each shift for required skills
  for (const [key, shiftAssignments] of Object.entries(byShiftAndDate)) {
    const [templateId] = key.split('_');
    const template = context.templates?.find(t => t.id === templateId);
    const requiredForTemplate = requiredSkills[templateId] || [];

    if (requiredForTemplate.length > 0) {
      const assignedSkills = new Set();
      for (const assignment of shiftAssignments) {
        const employee = context.employees?.find(e => e.id === assignment.employee_id);
        if (employee?.skills) {
          employee.skills.forEach(skill => assignedSkills.add(skill));
        }
      }

      const missing = requiredForTemplate.filter(skill => !assignedSkills.has(skill));
      if (missing.length > 0) {
        violations.push({
          shift_template_id: templateId,
          date: shiftAssignments[0].shift_date,
          missing_skills: missing
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    message: violations.length > 0
      ? `${violations.length} shift(s) missing required skills`
      : 'All shifts have required skill coverage',
    details: { violations }
  };
}

/**
 * Rule: no_blackout_assignments
 * Ensures no assignments during blackout periods
 */
function evaluateNoBlackoutAssignments(rule, schedule, assignments, context) {
  const violations = [];
  const blackouts = context.availability?.filter(a => 
    a.availability_type === 'blackout' || a.is_forbidden
  ) || [];

  for (const assignment of assignments) {
    for (const blackout of blackouts) {
      if (blackout.employee_id === assignment.employee_id &&
          blackout.date === assignment.shift_date) {
        const assignmentStart = new Date(`${assignment.shift_date}T${assignment.start_time}`);
        const assignmentEnd = new Date(`${assignment.shift_date}T${assignment.end_time}`);
        const blackoutStart = blackout.start_time 
          ? new Date(`${blackout.date}T${blackout.start_time}`)
          : new Date(`${blackout.date}T00:00:00`);
        const blackoutEnd = blackout.end_time
          ? new Date(`${blackout.date}T${blackout.end_time}`)
          : new Date(`${blackout.date}T23:59:59`);

        if (assignmentStart < blackoutEnd && assignmentEnd > blackoutStart) {
          violations.push({
            employee_id: assignment.employee_id,
            date: assignment.shift_date,
            shift_time: `${assignment.start_time}-${assignment.end_time}`,
            blackout_time: blackout.start_time && blackout.end_time
              ? `${blackout.start_time}-${blackout.end_time}`
              : 'all day'
          });
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    message: violations.length > 0
      ? `${violations.length} assignment(s) during blackout periods`
      : 'No assignments during blackout periods',
    details: { violations }
  };
}

/**
 * Rule: pinned_shifts_required
 * Ensures all pinned shifts are assigned
 */
function evaluatePinnedShiftsRequired(rule, schedule, assignments, context) {
  const pinned = context.availability?.filter(a => a.is_pinned) || [];
  const violations = [];

  for (const pin of pinned) {
    const weekStart = new Date(schedule.week_start_date);
    const weekEnd = new Date(schedule.week_end_date);
    const pinDate = new Date(pin.date);

    if (pinDate >= weekStart && pinDate <= weekEnd) {
      const hasAssignment = assignments.some(a =>
        a.employee_id === pin.employee_id &&
        a.shift_date === pin.date &&
        (!pin.shift_template_id || a.shift_template_id === pin.shift_template_id)
      );

      if (!hasAssignment) {
        violations.push({
          employee_id: pin.employee_id,
          date: pin.date,
          shift_template_id: pin.shift_template_id
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    message: violations.length > 0
      ? `${violations.length} pinned shift(s) not assigned`
      : 'All pinned shifts assigned',
    details: { violations }
  };
}

/**
 * Rule: demand_fulfillment
 * Ensures all demand requirements are met
 */
function evaluateDemandFulfillment(rule, schedule, assignments, context) {
  const demand = context.demand || [];
  const violations = [];

  // Count assignments per template per day
  const assignmentCounts = {};
  for (const assignment of assignments) {
    const key = `${assignment.shift_template_id}_${assignment.shift_date}`;
    assignmentCounts[key] = (assignmentCounts[key] || 0) + 1;
  }

  // Check each demand requirement
  for (const req of demand) {
    const dayOfWeek = new Date(req.effective_from || schedule.week_start_date).getDay();
    const weekStart = new Date(schedule.week_start_date);
    
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(weekStart);
      checkDate.setDate(weekStart.getDate() + i);
      
      if (checkDate.getDay() === dayOfWeek) {
        const key = `${req.shift_template_id}_${checkDate.toISOString().split('T')[0]}`;
        const assigned = assignmentCounts[key] || 0;
        
        if (assigned < req.required_count) {
          violations.push({
            shift_template_id: req.shift_template_id,
            date: checkDate.toISOString().split('T')[0],
            required: req.required_count,
            assigned
          });
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    message: violations.length > 0
      ? `${violations.length} shift(s) below required staffing`
      : 'All demand requirements met',
    details: { violations }
  };
}

// ========== SOFT CONSTRAINT EVALUATORS ==========

/**
 * Rule: employee_shift_preferences
 * Penalizes assignments that don't match employee preferences
 */
function evaluateEmployeePreferences(rule, schedule, assignments, context) {
  const preferences = context.availability?.filter(a => 
    a.availability_type === 'preferred'
  ) || [];
  
  let penalty = 0;
  const details = [];

  for (const assignment of assignments) {
    const pref = preferences.find(p =>
      p.employee_id === assignment.employee_id &&
      p.shift_template_id === assignment.shift_template_id &&
      p.date === assignment.shift_date
    );

    if (!pref) {
      // Check if there's a general preference for this shift type
      const generalPref = preferences.find(p =>
        p.employee_id === assignment.employee_id &&
        !p.shift_template_id &&
        p.date === assignment.shift_date
      );

      if (!generalPref) {
        penalty += rule.params?.penalty_per_violation || 10;
        details.push({
          employee_id: assignment.employee_id,
          date: assignment.shift_date,
          shift_template_id: assignment.shift_template_id
        });
      }
    }
  }

  return {
    penalty,
    message: details.length > 0
      ? `${details.length} assignment(s) not matching preferences`
      : 'All assignments match preferences',
    details: { violations: details }
  };
}

/**
 * Rule: minimize_shift_changes
 * Penalizes frequent shift type changes for employees
 */
function evaluateMinimizeShiftChanges(rule, schedule, assignments, context) {
  let penalty = 0;
  const byEmployee = {};

  for (const assignment of assignments) {
    if (!byEmployee[assignment.employee_id]) {
      byEmployee[assignment.employee_id] = [];
    }
    byEmployee[assignment.employee_id].push(assignment);
  }

  for (const [employeeId, empAssignments] of Object.entries(byEmployee)) {
    empAssignments.sort((a, b) => {
      const dateA = new Date(`${a.shift_date}T${a.start_time}`);
      const dateB = new Date(`${b.shift_date}T${b.start_time}`);
      return dateA - dateB;
    });

    let changes = 0;
    for (let i = 1; i < empAssignments.length; i++) {
      if (empAssignments[i].shift_template_id !== empAssignments[i - 1].shift_template_id) {
        changes++;
      }
    }

    if (changes > 0) {
      penalty += changes * (rule.params?.penalty_per_change || 5);
    }
  }

  return {
    penalty,
    message: penalty > 0
      ? `Shift changes detected (penalty: ${penalty})`
      : 'No shift changes',
    details: { total_changes: Object.values(byEmployee).reduce((sum, arr) => {
      let changes = 0;
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].shift_template_id !== arr[i - 1].shift_template_id) changes++;
      }
      return sum + changes;
    }, 0) }
  };
}

/**
 * Rule: balance_total_hours
 * Penalizes imbalanced hour distribution across employees
 */
function evaluateBalanceTotalHours(rule, schedule, assignments, context) {
  const byEmployee = {};
  
  for (const assignment of assignments) {
    if (!byEmployee[assignment.employee_id]) {
      byEmployee[assignment.employee_id] = 0;
    }
    
    const template = context.templates?.find(t => t.id === assignment.shift_template_id);
    const hours = template?.duration_hours || 8;
    byEmployee[assignment.employee_id] += hours;
  }

  const hours = Object.values(byEmployee);
  if (hours.length === 0) return { penalty: 0, message: 'No assignments' };

  const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
  const variance = hours.reduce((sum, h) => sum + Math.pow(h - avg, 2), 0) / hours.length;
  const stdDev = Math.sqrt(variance);

  const penalty = stdDev * (rule.params?.penalty_multiplier || 2);

  return {
    penalty,
    message: `Hour distribution variance: ${stdDev.toFixed(2)}h`,
    details: {
      average_hours: avg.toFixed(2),
      std_deviation: stdDev.toFixed(2),
      min_hours: Math.min(...hours).toFixed(2),
      max_hours: Math.max(...hours).toFixed(2)
    }
  };
}

/**
 * Rule: prefer_consecutive_shifts
 * Rewards consecutive shift assignments (negative penalty)
 */
function evaluatePreferConsecutiveShifts(rule, schedule, assignments, context) {
  const byEmployee = {};
  
  for (const assignment of assignments) {
    if (!byEmployee[assignment.employee_id]) {
      byEmployee[assignment.employee_id] = new Set();
    }
    byEmployee[assignment.employee_id].add(assignment.shift_date);
  }

  let reward = 0;
  for (const [employeeId, dates] of Object.entries(byEmployee)) {
    const sortedDates = Array.from(dates).sort().map(d => new Date(d));
    let consecutive = 1;
    let maxConsecutive = 1;

    for (let i = 1; i < sortedDates.length; i++) {
      const daysDiff = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
      if (daysDiff === 1) {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 1;
      }
    }

    // Reward longer consecutive blocks
    reward -= maxConsecutive * (rule.params?.reward_per_consecutive || 2);
  }

  return {
    penalty: Math.max(0, -reward), // Convert reward to penalty (lower is better)
    message: `Consecutive shift patterns optimized`,
    details: {}
  };
}

/**
 * Rule: avoid_split_weekends
 * Penalizes splitting weekends (working only one day of weekend)
 */
function evaluateAvoidSplitWeekends(rule, schedule, assignments, context) {
  let penalty = 0;
  const byEmployee = {};

  for (const assignment of assignments) {
    if (!byEmployee[assignment.employee_id]) {
      byEmployee[assignment.employee_id] = new Set();
    }
    byEmployee[assignment.employee_id].add(assignment.shift_date);
  }

  for (const [employeeId, dates] of Object.entries(byEmployee)) {
    const dateSet = new Set(dates);
    
    // Check each week in the schedule
    const weekStart = new Date(schedule.week_start_date);
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(weekStart);
      checkDate.setDate(weekStart.getDate() + i);
      const dayOfWeek = checkDate.getDay();
      
      // Saturday (6) or Sunday (0)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        const saturday = dayOfWeek === 6 ? checkDate : new Date(checkDate);
        if (dayOfWeek === 0) saturday.setDate(checkDate.getDate() - 1);
        
        const sunday = dayOfWeek === 0 ? checkDate : new Date(checkDate);
        if (dayOfWeek === 6) sunday.setDate(checkDate.getDate() + 1);
        
        const hasSaturday = dateSet.has(saturday.toISOString().split('T')[0]);
        const hasSunday = dateSet.has(sunday.toISOString().split('T')[0]);
        
        if (hasSaturday !== hasSunday) {
          penalty += rule.params?.penalty_per_split || 15;
        }
      }
    }
  }

  return {
    penalty,
    message: penalty > 0
      ? `Weekend splits detected (penalty: ${penalty})`
      : 'No weekend splits',
    details: {}
  };
}

export default RuleEngine;

