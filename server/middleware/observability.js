/**
 * Observability Middleware
 * Collects API metrics without exposing PII
 */

import { recordApiMetric, recordFeatureUsage } from '../services/observability/metricsCollector.js';

/**
 * Middleware to track API requests and errors
 */
export function trackApiMetrics(req, res, next) {
  const startTime = Date.now();
  const tenantId = req.orgId || req.user?.org_id;
  
  // Track response
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    const isError = res.statusCode >= 400;
    
    // Record metric asynchronously (don't block response)
    if (tenantId) {
      recordApiMetric(tenantId, isError, responseTime).catch(err => {
        console.error('[Observability] Error recording API metric:', err);
      });
      
      // Track feature usage based on route
      const featureKey = extractFeatureKey(req.path, req.method);
      if (featureKey) {
        recordFeatureUsage(tenantId, featureKey, req.user?.id).catch(err => {
          console.error('[Observability] Error recording feature usage:', err);
        });
      }
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

/**
 * Extract feature key from route path
 */
function extractFeatureKey(path, method) {
  // Map routes to feature keys
  const routeMap = {
    '/api/employees': 'employee_directory',
    '/api/timesheets': 'timesheet',
    '/api/leaves': 'leave_management',
    '/api/payroll': 'payroll',
    '/api/attendance': 'attendance_tracking',
    '/api/onboarding': 'advanced_onboarding',
    '/api/performance-reviews': 'performance_reviews',
    '/api/projects': 'project_management',
    '/api/reimbursements': 'expense_management',
    '/api/ai/chat': 'ai_assistant',
    '/api/scheduling': 'team_scheduling',
    '/api/background-checks': 'background_checks'
  };
  
  for (const [route, feature] of Object.entries(routeMap)) {
    if (path.startsWith(route)) {
      return feature;
    }
  }
  
  return null;
}

