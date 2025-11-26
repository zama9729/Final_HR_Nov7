/**
 * Staff Scheduling Algorithms
 * Implements multiple algorithms for generating schedules
 */

import { RuleEngine } from './rule-engine.js';

/**
 * Greedy Heuristic Scheduler
 * Fast, simple algorithm for basic scheduling
 */
export class GreedyScheduler {
  constructor(ruleEngine, options = {}) {
    this.ruleEngine = ruleEngine;
    this.options = options;
    this.priorNightCounts = options.priorNightCounts || {};
    this.seed = options.seed || 0;
    // Extract rule parameters for quick access
    this.maxNightShifts = this.extractMaxNightShifts(ruleEngine);
  }

  extractMaxNightShifts(ruleEngine) {
    if (!ruleEngine || !ruleEngine.rules) {
      console.log('[Scheduler] No rules found, defaulting to 2 consecutive nights');
      return 2;
    }
    
    // Check for max_consecutive_nights rule first (preferred)
    const consecutiveRule = ruleEngine.rules.find(r => 
      r.id === 'max_consecutive_nights' || 
      r.name === 'max_consecutive_nights' ||
      r.id === 'max_consecutive_night_shifts' ||
      r.name === 'max_consecutive_night_shifts'
    );
    if (consecutiveRule) {
      const maxNights = consecutiveRule.params?.max_nights || consecutiveRule.params?.max || 2;
      console.log(`[Scheduler] Found consecutive nights rule: ${maxNights}`);
      return maxNights;
    }
    
    // Fallback to max_night_shifts_per_week (but we'll treat it as consecutive)
    const nightShiftRule = ruleEngine.rules.find(r => 
      r.id === 'max_night_shifts_per_week' || 
      r.name === 'max_night_shifts_per_week' ||
      r.name === 'Maximum Night Shifts Per Week'
    );
    if (nightShiftRule) {
      const maxShifts = nightShiftRule.params?.max_shifts || 2;
      console.log(`[Scheduler] Found night shifts per week rule: ${maxShifts}, treating as consecutive`);
      return maxShifts;
    }
    
    console.log('[Scheduler] No night shift rule found, defaulting to 2 consecutive nights');
    return 2; // Default to 2 consecutive nights
  }

  /**
   * Generate a schedule using greedy heuristic
   */
  async generateSchedule(params) {
    const {
      weekStart,
      weekEnd,
      employees,
      templates,
      demand,
      availability,
      exceptions
    } = params;

    const assignments = [];
    const telemetry = {
      startTime: Date.now(),
      algorithm: 'greedy',
      iterations: 0,
      assignmentsCreated: 0,
      blockedAssignments: [],
      unfilledSlots: [],
      fairness: {
        priorNightCounts: this.priorNightCounts || {},
        nightShiftDistribution: {}
      }
    };

    // Create demand slots
    let demandSlots = this.createDemandSlots(weekStart, weekEnd, demand, templates);
    
    console.log(`[Scheduler] Created ${demandSlots.length} demand slots for ${employees.length} employees`);
    
    if (demandSlots.length === 0) {
      console.warn('[Scheduler] No demand slots created. Check demand requirements and templates.');
      return {
        assignments: [],
        telemetry: {
          ...telemetry,
          endTime: Date.now(),
          duration: 0,
          error: 'No demand slots to fill'
        }
      };
    }
    
    // Shuffle demand slots based on seed for randomization
    if (this.seed) {
      for (let i = demandSlots.length - 1; i > 0; i--) {
        const j = ((this.seed * 17 + i * 23) % (i + 1));
        [demandSlots[i], demandSlots[j]] = [demandSlots[j], demandSlots[i]];
      }
    }
    
    // Sort employees by availability and preferences
    const sortedEmployees = this.sortEmployeesByAvailability(employees, availability, weekStart, weekEnd);
    console.log(`[Scheduler] Sorted ${sortedEmployees.length} employees`);

    // Track assignments per employee to ensure fair distribution
    const employeeAssignmentCounts = new Map();
    employees.forEach(emp => employeeAssignmentCounts.set(emp.id, 0));

    // Fill each demand slot
    for (const slot of demandSlots) {
      let assigned = 0;
      
      // Sort employees for this slot considering their current assignment count
      // Add randomization based on seed for variation
      const employeesForSlot = [...sortedEmployees].sort((a, b) => {
        const aCount = employeeAssignmentCounts.get(a.id) || 0;
        const bCount = employeeAssignmentCounts.get(b.id) || 0;
        // Prefer employees with fewer assignments (fair distribution)
        if (aCount !== bCount) {
          return aCount - bCount;
        }
        // Then use original score
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        // If same score, add randomization based on seed for variation
        if (this.seed) {
          const aHash = ((this.seed * 31 + slot.date.charCodeAt(0) + (a.id || '').charCodeAt(0)) % 100);
          const bHash = ((this.seed * 31 + slot.date.charCodeAt(0) + (b.id || '').charCodeAt(0)) % 100);
          return aHash - bHash;
        }
        return 0;
      });
      
      for (const employee of employeesForSlot) {
        if (assigned >= slot.required) break;
        
        // Check if employee can be assigned
        if (this.canAssign(employee, slot, assignments, availability, exceptions, templates, telemetry)) {
          assignments.push({
            employee_id: employee.id,
            shift_date: slot.date,
            shift_template_id: slot.templateId,
            start_time: slot.startTime,
            end_time: slot.endTime,
            assigned_by: 'algorithm',
            role: slot.requiredRole
          });
          assigned++;
          employeeAssignmentCounts.set(employee.id, (employeeAssignmentCounts.get(employee.id) || 0) + 1);
          telemetry.assignmentsCreated++;
        }
      }

      if (assigned < slot.required) {
        // Could not fill all required slots
        console.warn(`[Scheduler] Could not fill all slots for ${slot.date} ${slot.templateName}: ${assigned}/${slot.required}`);
        telemetry.unfilledSlots.push({
          date: slot.date,
          template_id: slot.templateId,
          template_name: slot.templateName,
          requested: slot.required,
          filled: assigned,
          reason: 'insufficient_available_staff'
        });
      }
    }
    
    console.log(`[Scheduler] Created ${assignments.length} total assignments`);

    telemetry.endTime = Date.now();
    telemetry.duration = telemetry.endTime - telemetry.startTime;
    telemetry.fairness.nightShiftDistribution = this.calculateNightShiftCounts(assignments, templates);

    return {
      assignments,
      telemetry
    };
  }

  createDemandSlots(weekStart, weekEnd, demand, templates) {
    const slots = [];
    // Parse dates properly (handle both string and Date objects)
    const startDate = new Date(weekStart);
    const endDate = new Date(weekEnd);
    const currentDate = new Date(startDate);

    console.log(`[Scheduler] Creating demand slots from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}, ${demand.length} demand requirements, ${templates.length} templates`);

    // Reset time to avoid timezone issues
    currentDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const dateStr = currentDate.toISOString().split('T')[0];

      for (const req of demand) {
        // Match day of week (0=Sunday, 1=Monday, etc.)
        // req.day_of_week should be an integer 0-6
        const reqDayOfWeek = typeof req.day_of_week === 'number' ? req.day_of_week : parseInt(req.day_of_week);
        
        if (reqDayOfWeek === dayOfWeek) {
          const template = templates.find(t => t.id === req.shift_template_id);
          if (!template) {
            console.warn(`[Scheduler] Template ${req.shift_template_id} not found for demand requirement`);
            continue;
          }

          const requiredCount = req.required_count || 1;
          for (let i = 0; i < requiredCount; i++) {
            slots.push({
              date: dateStr,
              templateId: req.shift_template_id,
              templateName: template.name,
              startTime: template.start_time,
              endTime: template.end_time,
              required: 1,
              requiredRole: req.required_roles?.[i] || null
            });
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`[Scheduler] Created ${slots.length} demand slots`);
    if (slots.length === 0 && demand.length > 0) {
      console.warn(`[Scheduler] No slots created! Check day_of_week matching. Demand days: ${demand.map(d => d.day_of_week).join(', ')}`);
    }
    return slots;
  }

  sortEmployeesByAvailability(employees, availability, weekStart, weekEnd) {
    // Score employees based on availability and preferences
    const scored = employees.map(emp => {
      let score = 0;
      const empAvailability = availability.filter(a => a.employee_id === emp.id);
      
      // Prefer employees with more availability
      score += empAvailability.filter(a => a.availability_type === 'available').length * 10;
      
      // Prefer employees with preferences
      score += empAvailability.filter(a => a.availability_type === 'preferred').length * 5;
      
      const priorNightCount = this.priorNightCounts[emp.id] || 0;
      score -= priorNightCount * 50;

      return { ...emp, score };
    });
    
    // Use seed for randomization if provided
    const seed = this.options?.seed || 0;
    if (seed) {
      // Shuffle employees based on seed for variation
      const shuffled = [...scored];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (seed + i) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.sort((a, b) => {
        // Primary sort by score
        if (b.score !== a.score) return b.score - a.score;
        // Secondary sort by employee ID for consistency
        return (a.id || '').localeCompare(b.id || '');
      });
    }
    
    return scored.sort((a, b) => {
      // Primary sort by score
      if (b.score !== a.score) return b.score - a.score;
      // Secondary sort by employee ID for consistency
      return (a.id || '').localeCompare(b.id || '');
    });
  }

  canAssign(employee, slot, existingAssignments, availability, exceptions, templates, telemetry) {
    // Check blackouts
    const blackouts = availability.filter(a =>
      a.employee_id === employee.id &&
      a.date === slot.date &&
      (a.availability_type === 'blackout' || a.is_forbidden)
    );
    
    if (blackouts.length > 0) {
      telemetry?.blockedAssignments?.push({
        type: 'blackout',
        source: blackouts[0]?.source || 'blackout',
        date: slot.date,
        employee_id: employee.id,
        template_id: slot.templateId
      });
      return false;
    }

    // Check if already assigned this day
    const existing = existingAssignments.find(a =>
      a.employee_id === employee.id &&
      a.shift_date === slot.date
    );
    
    if (existing) {
      return false;
    }

    // Check max consecutive work days
    const employeeAssignments = existingAssignments
      .filter(a => a.employee_id === employee.id)
      .map(a => a.shift_date)
      .sort();
    
    if (employeeAssignments.length > 0) {
      // Check if adding this slot would create too many consecutive days
      const testDates = [...employeeAssignments, slot.date].sort();
      let maxConsecutive = 1;
      let currentConsecutive = 1;
      
      for (let i = 1; i < testDates.length; i++) {
        const prevDate = new Date(testDates[i - 1]);
        const currDate = new Date(testDates[i]);
        const daysDiff = (currDate - prevDate) / (1000 * 60 * 60 * 24);
        
        if (daysDiff === 1) {
          currentConsecutive++;
          maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
        } else {
          currentConsecutive = 1;
        }
      }
      
      // Default max consecutive days is 6, but should come from rules
      const maxConsecutiveDays = 6; // TODO: Get from rule engine
      if (maxConsecutive > maxConsecutiveDays) {
        return false;
      }
    }

    // Check max consecutive night shifts (not total per week)
    const template = templates?.find(t => t.id === slot.templateId);
    if (template?.shift_type === 'night') {
      // Get all night shift dates for this employee, sorted
      const employeeNightShiftDates = existingAssignments
        .filter(a => {
          if (a.employee_id !== employee.id) return false;
          const assigTemplate = templates?.find(t => t.id === a.shift_template_id);
          return assigTemplate?.shift_type === 'night';
        })
        .map(a => a.shift_date)
        .sort();
      
      const slotDate = slot.date;
      const maxConsecutiveNights = this.maxNightShifts || 2;
      
      // Check if adding this slot would create a consecutive sequence exceeding the limit
      // We need to find the longest consecutive sequence that includes this new date
      const allDates = [...employeeNightShiftDates, slotDate].sort();
      
      // Find consecutive sequences that include the slot date
      let maxConsecutiveIncludingSlot = 1;
      let currentConsecutive = 1;
      
      for (let i = 1; i < allDates.length; i++) {
        const prevDate = new Date(allDates[i - 1]);
        const currDate = new Date(allDates[i]);
        const daysDiff = (currDate - prevDate) / (1000 * 60 * 60 * 24);
        
        if (daysDiff === 1) {
          // Consecutive day
          currentConsecutive++;
          // Only count sequences that include the slot date
          if (allDates[i] === slotDate || allDates[i - 1] === slotDate) {
            maxConsecutiveIncludingSlot = Math.max(maxConsecutiveIncludingSlot, currentConsecutive);
          }
        } else {
          // Not consecutive, reset counter
          currentConsecutive = 1;
        }
      }
      
      // If adding this shift would exceed consecutive limit, block it
      if (maxConsecutiveIncludingSlot > maxConsecutiveNights) {
        console.log(`[Scheduler] Skipping assignment: Employee ${employee.id} would exceed max consecutive nights (${maxConsecutiveIncludingSlot} > ${maxConsecutiveNights})`);
        return false;
      }
    }

    // Check rest hours (simplified - would need to check against all existing assignments)
    // This is a simplified check; full implementation would check all previous assignments

    return true;
  }

  calculateNightShiftCounts(assignments, templates) {
    const counts = {};
    for (const assignment of assignments) {
      const template = templates?.find(t => t.id === assignment.shift_template_id);
      if (template?.shift_type === 'night') {
        counts[assignment.employee_id] = (counts[assignment.employee_id] || 0) + 1;
      }
    }
    return counts;
  }
}

/**
 * Constraint-Based Scheduler (ILP-like)
 * Uses constraint satisfaction for optimal scheduling
 */
export class ConstraintScheduler {
  constructor(ruleEngine, options = {}) {
    this.ruleEngine = ruleEngine;
    this.options = {
      maxIterations: 200, // Further reduced to fail faster
      timeout: 5000, // Reduced to 5 seconds for faster failure
      ...options
    };
    this.priorNightCounts = options.priorNightCounts || {};
    this.seed = options.seed || 0;
  }

  /**
   * Generate schedule using constraint satisfaction
   */
  async generateSchedule(params) {
    const {
      weekStart,
      weekEnd,
      employees,
      templates,
      demand,
      availability,
      exceptions,
      ruleSet
    } = params;

    const telemetry = {
      startTime: Date.now(),
      algorithm: 'constraint',
      iterations: 0,
      backtracks: 0,
      assignmentsCreated: 0
    };

    // Create all possible assignments
    const candidateAssignments = this.generateCandidates(
      weekStart,
      weekEnd,
      employees,
      templates,
      demand,
      availability,
      this.priorNightCounts
    );

    console.log(`[ConstraintScheduler] Generated ${candidateAssignments.length} candidate assignments`);

    // Limit candidates to prevent exponential explosion
    if (candidateAssignments.length > 500) {
      console.warn(`[ConstraintScheduler] Too many candidates (${candidateAssignments.length}), limiting to 500`);
      candidateAssignments.splice(500);
    }

    // Use backtracking to find valid assignment
    const assignments = [];
    const bestSolution = {
      assignments: [],
      score: Infinity
    };

    const startTime = Date.now();
    const result = this.backtrack(
      candidateAssignments,
      assignments,
      bestSolution,
      {
        weekStart,
        weekEnd,
        employees,
        templates,
        demand,
        availability,
        exceptions,
        ruleSet
      },
      telemetry,
      startTime
    );

    telemetry.endTime = Date.now();
    telemetry.duration = telemetry.endTime - telemetry.startTime;

    if (result && bestSolution.assignments.length > 0) {
      console.log(`[ConstraintScheduler] Found solution with ${bestSolution.assignments.length} assignments in ${telemetry.duration}ms`);
      return {
        assignments: bestSolution.assignments,
        telemetry
      };
    } else {
      // Fallback to greedy if constraint solver fails or times out
      console.warn(`[ConstraintScheduler] Failed or timed out after ${telemetry.duration}ms (${telemetry.iterations} iterations), falling back to greedy`);
      const greedy = new GreedyScheduler(this.ruleEngine, {
        priorNightCounts: this.priorNightCounts
      });
      return greedy.generateSchedule(params);
    }
  }

  generateCandidates(weekStart, weekEnd, employees, templates, demand, availability, priorNightCounts = {}) {
    const candidates = [];
    const currentDate = new Date(weekStart);
    const endDate = new Date(weekEnd);

    if (Number.isNaN(currentDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return candidates;
    }

    currentDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const dateStr = currentDate.toISOString().split('T')[0];

      for (const req of demand) {
        const reqDay =
          typeof req.day_of_week === 'number'
            ? req.day_of_week
            : parseInt(req.day_of_week, 10);

        if (reqDay === dayOfWeek) {
          const template = templates.find(t => t.id === req.shift_template_id);
          if (!template) continue;

          for (const employee of employees) {
            // Check if employee is available
            const empAvailability = availability.filter(a =>
              a.employee_id === employee.id &&
              a.date === dateStr
            );

            const hasBlackout = empAvailability.some(a =>
              a.availability_type === 'blackout' || a.is_forbidden
            );

            if (!hasBlackout) {
              candidates.push({
                employee_id: employee.id,
                shift_date: dateStr,
                shift_template_id: req.shift_template_id,
                start_time: template.start_time,
                end_time: template.end_time,
                priority: this.calculatePriority(employee, template, empAvailability, priorNightCounts)
              });
            }
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort by priority, then shuffle based on seed for randomization
    candidates.sort((a, b) => b.priority - a.priority);
    
    // Apply seed-based shuffling for randomization
    if (this.seed) {
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = (this.seed + i * 7) % (i + 1);
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
    }
    
    return candidates;
  }

  calculatePriority(employee, template, availability, priorNightCounts = {}) {
    let priority = 100;

    // Boost if preferred
    if (availability.some(a => a.availability_type === 'preferred' && a.shift_template_id === template.id)) {
      priority += 50;
    }

    // Boost if pinned
    if (availability.some(a => a.is_pinned && a.shift_template_id === template.id)) {
      priority += 100;
    }

    const priorCount = priorNightCounts[employee.id] || 0;
    priority -= priorCount * 50;

    return priority;
  }

  backtrack(candidates, currentAssignments, bestSolution, context, telemetry, startTime) {
    // Check limits BEFORE incrementing to prevent going over
    if (telemetry.iterations >= this.options.maxIterations) {
      return false; // Stop immediately, don't log every time
    }

    // Timeout check - fail fast
    if (Date.now() - startTime > this.options.timeout) {
      return false;
    }

    telemetry.iterations++;
    
    // Only log every 100 iterations to reduce spam
    if (telemetry.iterations % 100 === 0) {
      console.log(`[ConstraintScheduler] Iteration ${telemetry.iterations}/${this.options.maxIterations}`);
    }

    // Check if we've filled all demand
    if (this.isComplete(currentAssignments, context.demand, context.weekStart, context.weekEnd)) {
      // Evaluate solution
      const schedule = {
        week_start_date: context.weekStart,
        week_end_date: context.weekEnd
      };

      const evaluation = this.ruleEngine.evaluate(
        schedule,
        currentAssignments,
        context
      );

      if (evaluation.isValid) {
        const score = evaluation.score;
        if (score < bestSolution.score) {
          bestSolution.assignments = [...currentAssignments];
          bestSolution.score = score;
        }
        return true;
      }
    }

    // Try next candidate
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];

      // Check if candidate conflicts with current assignments
      if (this.hasConflict(candidate, currentAssignments, context)) {
        continue;
      }

      // Try this candidate
      currentAssignments.push({
        employee_id: candidate.employee_id,
        shift_date: candidate.shift_date,
        shift_template_id: candidate.shift_template_id,
        start_time: candidate.start_time,
        end_time: candidate.end_time,
        assigned_by: 'algorithm'
      });

      // Recurse
      const remaining = candidates.filter((c, idx) => idx !== i);
      if (this.backtrack(remaining, currentAssignments, bestSolution, context, telemetry, startTime)) {
        return true;
      }

      // Backtrack
      currentAssignments.pop();
      telemetry.backtracks++;
    }

    return false;
  }

  isComplete(assignments, demand, weekStart, weekEnd) {
    // Check if all demand slots are filled
    const demandCounts = {};
    for (const req of demand) {
      const key = `${req.shift_template_id}_${req.day_of_week}`;
      demandCounts[key] = (demandCounts[key] || 0) + req.required_count;
    }

    const assignmentCounts = {};
    for (const assignment of assignments) {
      const date = new Date(assignment.shift_date);
      const dayOfWeek = date.getDay();
      const key = `${assignment.shift_template_id}_${dayOfWeek}`;
      assignmentCounts[key] = (assignmentCounts[key] || 0) + 1;
    }

    for (const [key, required] of Object.entries(demandCounts)) {
      if ((assignmentCounts[key] || 0) < required) {
        return false;
      }
    }

    return true;
  }

  hasConflict(candidate, assignments, context) {
    // Check if employee already assigned this day
    const sameDay = assignments.find(a =>
      a.employee_id === candidate.employee_id &&
      a.shift_date === candidate.shift_date
    );

    if (sameDay) return true;

    // Check rest hours (simplified)
    const prevDay = assignments.find(a =>
      a.employee_id === candidate.employee_id
    );

    if (prevDay) {
      const prevDate = new Date(prevDay.shift_date);
      const currDate = new Date(candidate.shift_date);
      const daysDiff = (currDate - prevDate) / (1000 * 60 * 60 * 24);

      if (daysDiff === 1) {
        // Check rest hours
        const prevEnd = new Date(`${prevDay.shift_date}T${prevDay.end_time}`);
        const currStart = new Date(`${candidate.shift_date}T${candidate.start_time}`);
        const restHours = (currStart - prevEnd) / (1000 * 60 * 60);

        if (restHours < 11) {
          return true;
        }
      }
    }

    return false;
  }
}

/**
 * Simulated Annealing Scheduler
 * Uses simulated annealing for large-scale optimization
 */
export class SimulatedAnnealingScheduler {
  constructor(ruleEngine, options = {}) {
    this.ruleEngine = ruleEngine;
    this.options = {
      initialTemperature: 1000,
      coolingRate: 0.95,
      maxIterations: 10000,
      ...options
    };
    this.priorNightCounts = options.priorNightCounts || {};
  }

  async generateSchedule(params) {
    // Start with greedy solution
    const greedy = new GreedyScheduler(this.ruleEngine, {
      priorNightCounts: this.priorNightCounts
    });
    const initial = await greedy.generateSchedule({
      ...params,
      priorNightCounts: this.priorNightCounts
    });

    let currentSolution = initial.assignments;
    let bestSolution = [...currentSolution];
    let temperature = this.options.initialTemperature;

    const telemetry = {
      startTime: Date.now(),
      algorithm: 'simulated_annealing',
      iterations: 0,
      improvements: 0
    };

    const schedule = {
      week_start_date: params.weekStart,
      week_end_date: params.weekEnd
    };

    let bestScore = this.ruleEngine.evaluate(schedule, bestSolution, {
      employees: params.employees,
      templates: params.templates,
      availability: params.availability,
      exceptions: params.exceptions
    }).score;

    for (let i = 0; i < this.options.maxIterations; i++) {
      telemetry.iterations++;

      // Generate neighbor solution
      const neighbor = this.generateNeighbor(currentSolution, params);

      // Evaluate neighbor
      const neighborEval = this.ruleEngine.evaluate(schedule, neighbor, {
        employees: params.employees,
        templates: params.templates,
        availability: params.availability,
        exceptions: params.exceptions
      });

      if (!neighborEval.isValid) {
        continue; // Skip invalid solutions
      }

      const delta = neighborEval.score - bestScore;

      // Accept if better or with probability (simulated annealing)
      if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
        currentSolution = neighbor;
        
        if (neighborEval.score < bestScore) {
          bestSolution = [...neighbor];
          bestScore = neighborEval.score;
          telemetry.improvements++;
        }
      }

      // Cool down
      temperature *= this.options.coolingRate;

      if (temperature < 0.1) {
        break; // Converged
      }
    }

    telemetry.endTime = Date.now();
    telemetry.duration = telemetry.endTime - telemetry.startTime;
    telemetry.finalScore = bestScore;

    return {
      assignments: bestSolution,
      telemetry
    };
  }

  generateNeighbor(solution, params) {
    // Randomly swap two assignments or move one assignment
    const neighbor = [...solution];

    if (neighbor.length < 2) {
      return neighbor;
    }

    const i = Math.floor(Math.random() * neighbor.length);
    const j = Math.floor(Math.random() * neighbor.length);

    if (i !== j) {
      // Swap
      [neighbor[i], neighbor[j]] = [neighbor[j], neighbor[i]];
    }

    return neighbor;
  }
}

/**
 * Factory function to get scheduler by algorithm name
 */
export function getScheduler(algorithm, ruleEngine, options = {}) {
  switch (algorithm) {
    case 'greedy':
      return new GreedyScheduler(ruleEngine, options);
    case 'ilp':
    case 'constraint':
      return new ConstraintScheduler(ruleEngine, options);
    case 'simulated_annealing':
      return new SimulatedAnnealingScheduler(ruleEngine, options);
    default:
      throw new Error(`Unknown algorithm: ${algorithm}`);
  }
}

export default {
  GreedyScheduler,
  ConstraintScheduler,
  SimulatedAnnealingScheduler,
  getScheduler
};

