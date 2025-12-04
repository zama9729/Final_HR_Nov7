/**
 * ScoreRank Scheduler
 * A deterministic, fairness-focused scheduler that assigns shifts based on a rolling "fatigue score".
 * Supports: Individual, Team, and Mixed scheduling modes.
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
            maxConsecutiveNights: 3,
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
            teams, // [NEW] List of teams with members
            templates,
            demand,
            availability,
            exceptions,
            ruleSet
        } = params;

        const telemetry = {
            startTime: Date.now(),
            algorithm: 'score_rank',
            assignmentsCreated: 0,
            conflicts: [],
            scoreUpdates: 0
        };

        console.log(`[ScoreRank] Starting generation for ${employees.length} employees, ${teams?.length || 0} teams, seed=${this.options.seed}`);

        // 1. Initialize/Fetch Scores
        const employeeScores = await this.fetchEmployeeScores(employees.map(e => e.id));
        const teamScores = await this.fetchTeamScores(teams ? teams.map(t => t.id) : []);

        // 2. Create Demand Slots (Chronological Order)
        let slots = this.createDemandSlots(weekStart, weekEnd, demand, templates);

        // Sort slots chronologically
        slots.sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.startTime}`);
            const dateB = new Date(`${b.date}T${b.startTime}`);
            return dateA - dateB;
        });

        const assignments = [];
        const historyLog = [];
        const teamHistoryLog = [];

        // 3. Assign Slots
        for (const slot of slots) {
            // Determine assignment type for this slot
            const isTeamSlot = slot.assignmentType === 'team';

            // Filter candidates
            const candidates = isTeamSlot
                ? this.getTeamCandidates(slot, teams, assignments, availability, exceptions, templates)
                : this.getEmployeeCandidates(slot, employees, assignments, availability, exceptions, templates);

            if (candidates.length === 0) {
                telemetry.conflicts.push({
                    slot,
                    reason: `No eligible ${isTeamSlot ? 'team' : 'employee'} candidates`
                });
                continue;
            }

            // Score candidates
            const scoredCandidates = candidates.map(candidate => {
                let currentScore = 0;
                let effectiveScore = 0;

                if (isTeamSlot) {
                    // Team Score = Team Base Score + Avg(Member Scores)
                    const baseScore = teamScores.get(candidate.id) || 0;
                    const memberIds = candidate.member_ids || []; // Assuming team object has member_ids
                    let totalMemberScore = 0;
                    let validMembers = 0;

                    for (const mid of memberIds) {
                        if (employeeScores.has(mid)) {
                            totalMemberScore += employeeScores.get(mid);
                            validMembers++;
                        }
                    }
                    const avgMemberScore = validMembers > 0 ? totalMemberScore / validMembers : 0;
                    currentScore = baseScore;
                    effectiveScore = baseScore + avgMemberScore;
                } else {
                    // Employee Score
                    currentScore = employeeScores.get(candidate.id) || 0;
                    effectiveScore = currentScore;

                    // Preference bonus (lower score is better)
                    const pref = availability.find(a =>
                        a.employee_id === candidate.id &&
                        a.date === slot.date &&
                        a.availability_type === 'preferred'
                    );
                    if (pref) effectiveScore -= 2.0;
                }

                return {
                    candidate,
                    score: effectiveScore,
                    rawScore: currentScore
                };
            });

            // Sort by Lowest Score -> Tie Breaker
            scoredCandidates.sort((a, b) => {
                if (Math.abs(a.score - b.score) > 0.1) {
                    return a.score - b.score;
                }
                const hashA = this.pseudoRandom(this.options.seed, slot.date, a.candidate.id);
                const hashB = this.pseudoRandom(this.options.seed, slot.date, b.candidate.id);
                return hashA - hashB;
            });

            // Pick winner
            const winner = scoredCandidates[0];
            const assignedEntity = winner.candidate;

            // Create Assignment(s)
            const template = templates.find(t => t.id === slot.templateId);
            const shiftType = template?.shift_type || 'day';
            const weight = this.options.shiftWeights[shiftType] || 1.0;

            if (isTeamSlot) {
                // Assign Team
                assignments.push({
                    team_id: assignedEntity.id,
                    shift_date: slot.date,
                    shift_template_id: slot.templateId,
                    start_time: slot.startTime,
                    end_time: slot.endTime,
                    assigned_by: 'system',
                    assignment_type: 'team',
                    role: slot.requiredRole
                });

                // Update Team Score
                const newTeamScore = (teamScores.get(assignedEntity.id) || 0) + weight;
                teamScores.set(assignedEntity.id, newTeamScore);

                teamHistoryLog.push({
                    team_id: assignedEntity.id,
                    shift_date: slot.date,
                    shift_type: shiftType,
                    score_delta: weight,
                    score_after: newTeamScore
                });

                // Update Member Scores (partial weight)
                const memberWeight = weight * 0.3;
                const memberIds = assignedEntity.member_ids || [];
                for (const mid of memberIds) {
                    const currentEmpScore = employeeScores.get(mid) || 0;
                    const newEmpScore = currentEmpScore + memberWeight;
                    employeeScores.set(mid, newEmpScore);

                    // Also create individual assignments for members so they show up in their calendars
                    // Note: In a real system, we might link these to the team assignment
                    assignments.push({
                        employee_id: mid,
                        team_id: assignedEntity.id, // Link to team
                        shift_date: slot.date,
                        shift_template_id: slot.templateId,
                        start_time: slot.startTime,
                        end_time: slot.endTime,
                        assigned_by: 'system', // or 'team_system'
                        assignment_type: 'team_member', // distinct type
                        role: slot.requiredRole
                    });

                    historyLog.push({
                        employee_id: mid,
                        shift_date: slot.date,
                        shift_type: shiftType,
                        score_delta: memberWeight,
                        score_after: newEmpScore
                    });
                }

            } else {
                // Assign Employee
                assignments.push({
                    employee_id: assignedEntity.id,
                    shift_date: slot.date,
                    shift_template_id: slot.templateId,
                    start_time: slot.startTime,
                    end_time: slot.endTime,
                    assigned_by: 'system',
                    assignment_type: 'employee',
                    role: slot.requiredRole
                });

                // Update Employee Score
                const newScore = (employeeScores.get(assignedEntity.id) || 0) + weight;
                employeeScores.set(assignedEntity.id, newScore);

                historyLog.push({
                    employee_id: assignedEntity.id,
                    shift_date: slot.date,
                    shift_type: shiftType,
                    score_delta: weight,
                    score_after: newScore
                });
            }

            telemetry.assignmentsCreated++;
            telemetry.scoreUpdates++;
        }

        // 4. Apply Decay
        for (const [id, score] of employeeScores.entries()) {
            employeeScores.set(id, Math.max(0, score * (1 - this.options.decayRate)));
        }
        for (const [id, score] of teamScores.entries()) {
            teamScores.set(id, Math.max(0, score * (1 - this.options.decayRate)));
        }

        // 5. Persist Scores
        await this.persistScores(employeeScores, teamScores, historyLog, teamHistoryLog);

        telemetry.endTime = Date.now();
        telemetry.duration = telemetry.endTime - telemetry.startTime;

        console.log(`[ScoreRank] Generated ${assignments.length} assignments. Conflicts: ${telemetry.conflicts.length}`);

        return {
            assignments,
            telemetry
        };
    }

    /**
     * Filter eligible EMPLOYEE candidates
     */
    getEmployeeCandidates(slot, employees, currentAssignments, availability, exceptions, templates) {
        return employees.filter(employee => {
            // 1. Blackouts/Leave
            const isBlackout = availability.some(a =>
                a.employee_id === employee.id &&
                a.date === slot.date &&
                (a.availability_type === 'blackout' || a.is_forbidden)
            );
            if (isBlackout) return false;

            // 2. Already Assigned Today (Individual or via Team)
            const assignedToday = currentAssignments.some(a =>
                a.employee_id === employee.id &&
                a.shift_date === slot.date
            );
            if (assignedToday) return false;

            // 3. Minimum Rest (Simplified)
            if (!this.checkMinimumRest(employee.id, slot, currentAssignments, templates)) return false;

            // 4. Max Consecutive Nights
            if (!this.checkConsecutiveNights(employee.id, slot, currentAssignments, templates)) return false;

            return true;
        });
    }

    /**
     * Filter eligible TEAM candidates
     */
    getTeamCandidates(slot, teams, currentAssignments, availability, exceptions, templates) {
        if (!teams) return [];

        return teams.filter(team => {
            const memberIds = team.member_ids || [];
            if (memberIds.length === 0) return false;

            // 1. Check if ANY member is already assigned today
            const memberAssigned = currentAssignments.some(a =>
                memberIds.includes(a.employee_id) &&
                a.shift_date === slot.date
            );
            if (memberAssigned) return false;

            // 2. Check Team Availability (if > 20% members unavailable, team is unavailable)
            let unavailableCount = 0;
            for (const mid of memberIds) {
                const isBlackout = availability.some(a =>
                    a.employee_id === mid &&
                    a.date === slot.date &&
                    (a.availability_type === 'blackout' || a.is_forbidden)
                );
                if (isBlackout) unavailableCount++;
            }

            if (unavailableCount / memberIds.length > 0.2) return false; // >20% unavailable

            // 3. Check Rest/Consecutive for ALL members (Strict: if one fails, team fails)
            for (const mid of memberIds) {
                if (!this.checkMinimumRest(mid, slot, currentAssignments, templates)) return false;
                if (!this.checkConsecutiveNights(mid, slot, currentAssignments, templates)) return false;
            }

            return true;
        });
    }

    checkMinimumRest(employeeId, slot, assignments, templates) {
        const prevDate = new Date(slot.date);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = prevDate.toISOString().split('T')[0];

        const prevAssignment = assignments.find(a =>
            a.employee_id === employeeId &&
            a.shift_date === prevDateStr
        );

        if (prevAssignment) {
            const prevTemplate = templates.find(t => t.id === prevAssignment.shift_template_id);
            const currTemplate = templates.find(t => t.id === slot.templateId);

            if (prevTemplate && currTemplate) {
                if (prevTemplate.shift_type === 'night' && currTemplate.shift_type !== 'night') {
                    return false;
                }
            }
        }
        return true;
    }

    checkConsecutiveNights(employeeId, slot, assignments, templates) {
        const template = templates.find(t => t.id === slot.templateId);
        if (template?.shift_type === 'night') {
            let consecutive = 0;
            let checkDate = new Date(slot.date);

            while (true) {
                checkDate.setDate(checkDate.getDate() - 1);
                const dateStr = checkDate.toISOString().split('T')[0];
                const assignment = assignments.find(a =>
                    a.employee_id === employeeId &&
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
    }

    createDemandSlots(weekStart, weekEnd, demand, templates) {
        const slots = [];
        const startDate = new Date(weekStart);
        const endDate = new Date(weekEnd);
        const currentDate = new Date(startDate);

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

                    // Determine assignment type: override from demand, else template default
                    const assignmentType = req.assignment_type || template.schedule_mode || 'employee';

                    const count = req.required_count || 1;
                    for (let i = 0; i < count; i++) {
                        slots.push({
                            date: dateStr,
                            templateId: req.shift_template_id,
                            startTime: template.start_time,
                            endTime: template.end_time,
                            requiredRole: req.required_roles?.[i] || null,
                            assignmentType: assignmentType // 'employee' or 'team'
                        });
                    }
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return slots;
    }

    async fetchEmployeeScores(employeeIds) {
        const scores = new Map();
        if (!employeeIds.length) return scores;
        try {
            const res = await query(
                `SELECT employee_id, score FROM employee_shift_scores 
                 WHERE tenant_id = $1 AND employee_id = ANY($2)`,
                [this.tenantId, employeeIds]
            );
            for (const row of res.rows) scores.set(row.employee_id, parseFloat(row.score));
        } catch (err) {
            console.error('Error fetching employee scores:', err);
        }
        return scores;
    }

    async fetchTeamScores(teamIds) {
        const scores = new Map();
        if (!teamIds.length) return scores;
        try {
            const res = await query(
                `SELECT team_id, score FROM team_shift_scores 
                 WHERE tenant_id = $1 AND team_id = ANY($2)`,
                [this.tenantId, teamIds]
            );
            for (const row of res.rows) scores.set(row.team_id, parseFloat(row.score));
        } catch (err) {
            console.error('Error fetching team scores:', err);
        }
        return scores;
    }

    async persistScores(empScores, teamScores, empHistory, teamHistory) {
        // In a real app, use a transaction. Here we just run queries.
        try {
            // 1. Employee Scores
            for (const [id, score] of empScores.entries()) {
                await query(
                    `INSERT INTO employee_shift_scores (tenant_id, employee_id, score, last_updated)
                     VALUES ($1, $2, $3, now())
                     ON CONFLICT (tenant_id, employee_id) DO UPDATE SET score = $3, last_updated = now()`,
                    [this.tenantId, id, score]
                );
            }
            // 2. Team Scores
            for (const [id, score] of teamScores.entries()) {
                await query(
                    `INSERT INTO team_shift_scores (tenant_id, team_id, score, last_updated)
                     VALUES ($1, $2, $3, now())
                     ON CONFLICT (tenant_id, team_id) DO UPDATE SET score = $3, last_updated = now()`,
                    [this.tenantId, id, score]
                );
            }
            // 3. History Logs
            for (const h of empHistory) {
                await query(
                    `INSERT INTO shift_assignment_history 
                     (tenant_id, employee_id, shift_date, shift_type, score_delta, score_after)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [this.tenantId, h.employee_id, h.shift_date, h.shift_type, h.score_delta, h.score_after]
                );
            }
            for (const h of teamHistory) {
                await query(
                    `INSERT INTO team_assignment_history 
                     (tenant_id, team_id, shift_date, shift_type, score_delta, score_after)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [this.tenantId, h.team_id, h.shift_date, h.shift_type, h.score_delta, h.score_after]
                );
            }
        } catch (err) {
            console.error('Error persisting scores:', err);
        }
    }

    pseudoRandom(seed, input1, input2) {
        const str = `${seed}-${input1}-${input2}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }
}
