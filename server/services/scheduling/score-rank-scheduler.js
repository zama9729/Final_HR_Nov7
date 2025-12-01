/**
 * ScoreRank Scheduler
 * A deterministic, fairness-focused scheduler that assigns shifts based on a rolling "fatigue score".
 */

import { query } from '../../db/pool.js';

export class ScoreRankScheduler {
    constructor(ruleEngine, options = {}) {
        this.ruleEngine = ruleEngine;
        this.options = {
            shiftWeights: {
                night: 5.0,
                evening: 3.0,
                day: 1.0,
                custom: 2.0
            },
            decayRate: 0.05, // Score decays by 5% per day or run
            minRestHours: 11,
            maxConsecutiveNights: 3, // Default, can be overridden by rules
            seed: options.seed || Date.now(),
            ...options
        };
        this.tenantId = options.tenantId;
    }

    /**
     * Generate a schedule using ScoreRank algorithm
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
            ruleSet,
            priorNightCounts // Legacy support, but we'll use scores primarily
        } = params;

        const telemetry = {
            startTime: Date.now(),
            algorithm: 'score_rank',
            assignmentsCreated: 0,
            conflicts: [],
            scoreUpdates: 0
        };

        console.log(`[ScoreRank] Starting generation for ${employees.length} employees, seed=${this.options.seed}`);

        // 1. Initialize/Fetch Scores
        // We need to fetch current scores from DB. If not present, initialize to 0.
        const employeeScores = await this.fetchEmployeeScores(employees.map(e => e.id));

        // 2. Create Demand Slots (Chronological Order)
        let slots = this.createDemandSlots(weekStart, weekEnd, demand, templates);

        // Sort slots chronologically to ensure fairness flows through time
        slots.sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.startTime}`);
            const dateB = new Date(`${b.date}T${b.startTime}`);
            return dateA - dateB;
        });

        const assignments = [];
        const historyLog = [];

        // 3. Assign Slots
        for (const slot of slots) {
            // Filter candidates
            const candidates = this.getCandidates(slot, employees, assignments, availability, exceptions, templates);

            if (candidates.length === 0) {
                telemetry.conflicts.push({
                    slot,
                    reason: 'No eligible candidates'
                });
                continue;
            }

            // Score candidates
            const scoredCandidates = candidates.map(employee => {
                const currentScore = employeeScores.get(employee.id) || 0;

                // Calculate effective score (base score + soft penalties)
                let effectiveScore = currentScore;

                // Penalty for preferences (if they prefer NOT to work this, add penalty to make them less likely)
                // Actually, we want lowest score to be picked. So if they prefer it, we SUBTRACT from score.
                const pref = availability.find(a =>
                    a.employee_id === employee.id &&
                    a.date === slot.date &&
                    a.availability_type === 'preferred'
                );
                if (pref) effectiveScore -= 2.0; // Boost preference

                return {
                    employee,
                    score: effectiveScore,
                    rawScore: currentScore
                };
            });

            // Sort by Lowest Score -> Tie Breaker (Seed/Random)
            scoredCandidates.sort((a, b) => {
                if (Math.abs(a.score - b.score) > 0.1) {
                    return a.score - b.score; // Lowest score first
                }
                // Tie-breaker: Deterministic pseudo-random based on seed + slot + employee
                const hashA = this.pseudoRandom(this.options.seed, slot.date, a.employee.id);
                const hashB = this.pseudoRandom(this.options.seed, slot.date, b.employee.id);
                return hashA - hashB;
            });

            // Pick winner
            const winner = scoredCandidates[0];
            const assignedEmployee = winner.employee;

            // Create Assignment
            assignments.push({
                employee_id: assignedEmployee.id,
                shift_date: slot.date,
                shift_template_id: slot.templateId,
                start_time: slot.startTime,
                end_time: slot.endTime,
                assigned_by: 'system',
                role: slot.requiredRole
            });

            // Update Score
            const template = templates.find(t => t.id === slot.templateId);
            const shiftType = template?.shift_type || 'day';
            const weight = this.options.shiftWeights[shiftType] || 1.0;

            const newScore = (employeeScores.get(assignedEmployee.id) || 0) + weight;
            employeeScores.set(assignedEmployee.id, newScore);

            historyLog.push({
                employee_id: assignedEmployee.id,
                shift_date: slot.date,
                shift_type: shiftType,
                score_delta: weight,
                score_after: newScore
            });

            telemetry.assignmentsCreated++;
            telemetry.scoreUpdates++;
        }

        // 4. Apply Decay (End of Run)
        // We apply decay to everyone to ensure scores don't grow infinitely
        for (const [empId, score] of employeeScores.entries()) {
            const decayed = Math.max(0, score * (1 - this.options.decayRate));
            employeeScores.set(empId, decayed);
        }

        // 5. Persist Scores (Async/Background ideally, but here we await for correctness)
        await this.persistScores(employeeScores, historyLog);

        telemetry.endTime = Date.now();
        telemetry.duration = telemetry.endTime - telemetry.startTime;

        console.log(`[ScoreRank] Generated ${assignments.length} assignments. Conflicts: ${telemetry.conflicts.length}`);

        return {
            assignments,
            telemetry
        };
    }

    /**
     * Filter eligible candidates for a slot
     */
    getCandidates(slot, employees, currentAssignments, availability, exceptions, templates) {
        return employees.filter(employee => {
            // 1. Blackouts/Leave
            const isBlackout = availability.some(a =>
                a.employee_id === employee.id &&
                a.date === slot.date &&
                (a.availability_type === 'blackout' || a.is_forbidden)
            );
            if (isBlackout) return false;

            // 2. Already Assigned Today
            const assignedToday = currentAssignments.some(a =>
                a.employee_id === employee.id &&
                a.shift_date === slot.date
            );
            if (assignedToday) return false;

            // 3. Minimum Rest (Simplified check against previous day's assignment)
            // In a real implementation, we'd check the exact end time of the previous shift
            const prevDate = new Date(slot.date);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevDateStr = prevDate.toISOString().split('T')[0];

            const prevAssignment = currentAssignments.find(a =>
                a.employee_id === employee.id &&
                a.shift_date === prevDateStr
            );

            if (prevAssignment) {
                const prevTemplate = templates.find(t => t.id === prevAssignment.shift_template_id);
                const currTemplate = templates.find(t => t.id === slot.templateId);

                if (prevTemplate && currTemplate) {
                    // Calculate rest hours (approximate for now)
                    // If previous was Night (ends ~8AM) and current is Day (starts ~8AM), rest is ~24h (OK)
                    // If previous was Night (ends ~8AM) and current is Morning (starts ~8AM), rest is 0h (FAIL)
                    // Rough check: Night -> Morning/Day is usually bad immediately
                    if (prevTemplate.shift_type === 'night' && currTemplate.shift_type !== 'night') {
                        // Strict rest check needed here
                        // For now, block Night -> Day transition immediately
                        return false;
                    }
                }
            }

            // 4. Max Consecutive Nights
            const template = templates.find(t => t.id === slot.templateId);
            if (template?.shift_type === 'night') {
                // Count consecutive nights backwards
                let consecutive = 0;
                let checkDate = new Date(slot.date);

                while (true) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    const dateStr = checkDate.toISOString().split('T')[0];
                    const assignment = currentAssignments.find(a =>
                        a.employee_id === employee.id &&
                        a.shift_date === dateStr
                    );

                    if (!assignment) break;

                    const t = templates.find(temp => temp.id === assignment.shift_template_id);
                    if (t?.shift_type === 'night') {
                        consecutive++;
                    } else {
                        break;
                    }
                }

                if (consecutive >= this.options.maxConsecutiveNights) return false;
            }

            return true;
        });
    }

    /**
     * Create demand slots from requirements
     */
    createDemandSlots(weekStart, weekEnd, demand, templates) {
        const slots = [];
        const startDate = new Date(weekStart);
        const endDate = new Date(weekEnd);
        const currentDate = new Date(startDate);

        // Reset time
        currentDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            const dateStr = currentDate.toISOString().split('T')[0];

            for (const req of demand) {
                const reqDay = typeof req.day_of_week === 'number' ? req.day_of_week : parseInt(req.day_of_week);

                if (reqDay === dayOfWeek) {
                    const template = templates.find(t => t.id === req.shift_template_id);
                    if (!template) continue;

                    const count = req.required_count || 1;
                    for (let i = 0; i < count; i++) {
                        slots.push({
                            date: dateStr,
                            templateId: req.shift_template_id,
                            startTime: template.start_time,
                            endTime: template.end_time,
                            requiredRole: req.required_roles?.[i] || null
                        });
                    }
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return slots;
    }

    /**
     * Fetch current scores from DB
     */
    async fetchEmployeeScores(employeeIds) {
        const scores = new Map();
        if (!employeeIds.length) return scores;

        try {
            const res = await query(
                `SELECT employee_id, score FROM employee_shift_scores 
         WHERE tenant_id = $1 AND employee_id = ANY($2)`,
                [this.tenantId, employeeIds]
            );

            for (const row of res.rows) {
                scores.set(row.employee_id, parseFloat(row.score));
            }
        } catch (err) {
            console.error('Error fetching scores:', err);
        }
        return scores;
    }

    /**
     * Persist updated scores and history to DB
     */
    async persistScores(scores, history) {
        const client = await query('BEGIN'); // Start transaction (simulated)
        try {
            // 1. Upsert Scores
            for (const [empId, score] of scores.entries()) {
                await query(
                    `INSERT INTO employee_shift_scores (tenant_id, employee_id, score, last_updated)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (tenant_id, employee_id) 
           DO UPDATE SET score = $3, last_updated = now()`,
                    [this.tenantId, empId, score]
                );
            }

            // 2. Insert History (Batching would be better in prod)
            for (const entry of history) {
                await query(
                    `INSERT INTO shift_assignment_history 
           (tenant_id, employee_id, shift_date, shift_type, score_delta, score_after)
           VALUES ($1, $2, $3, $4, $5, $6)`,
                    [this.tenantId, entry.employee_id, entry.shift_date, entry.shift_type, entry.score_delta, entry.score_after]
                );
            }

            // await query('COMMIT'); // Commit not needed with pool.query usually, but good for explicit transactions
        } catch (err) {
            console.error('Error persisting scores:', err);
            // await query('ROLLBACK');
        }
    }

    /**
     * Deterministic pseudo-random number generator
     */
    pseudoRandom(seed, input1, input2) {
        const str = `${seed}-${input1}-${input2}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }
}
