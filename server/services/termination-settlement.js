import { query } from '../db/pool.js';

const DEFAULT_NOTICE_DAYS = Number(process.env.DEFAULT_NOTICE_DAYS || 30);
const DEFAULT_RETR_DAILY_DAYS = Number(process.env.DEFAULT_RETR_COMP_DAYS || 15);

const WORKFLOW_BY_TYPE = {
  resignation: ['manager_review', 'hr_review', 'payroll_hold'],
  mutual: ['hr_review', 'payroll_hold'],
  cause: ['hr_review', 'legal_review', 'payroll_hold'],
  retrenchment: ['hr_review', 'legal_review', 'payroll_hold'],
  redundancy: ['hr_review', 'legal_review', 'payroll_hold'],
};

const STATUS_ROLE_MAP = {
  manager_review: ['manager', 'hr', 'admin', 'orgadmin'],
  hr_review: ['hr', 'admin', 'orgadmin'],
  legal_review: ['legal', 'hr', 'admin', 'orgadmin'],
  payroll_hold: ['payroll', 'hr', 'admin', 'orgadmin'],
};

export const determineWorkflowStages = (type) => {
  const normalized = type?.toLowerCase();
  return WORKFLOW_BY_TYPE[normalized] || WORKFLOW_BY_TYPE.resignation;
};

export const allowedRolesForStatus = (status) => STATUS_ROLE_MAP[status] || ['hr', 'admin', 'orgadmin'];

const normalizeDate = (value) => (value ? new Date(value) : null);

const yearsBetween = (fromDate, toDate) => {
  if (!fromDate || !toDate) return 0;
  const diff = toDate.getTime() - fromDate.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
};

const fetchEmployeeComp = async (employeeId, tenantId) => {
  const { rows } = await query(
    `
    SELECT 
      e.id,
      e.tenant_id,
      e.join_date,
      NULL::DATE AS last_working_day,
      0::NUMERIC AS base_pay,
      0::NUMERIC AS salary,
      0::NUMERIC AS compensation_ctc,
      0::INTEGER AS notice_period_days
    FROM employees e
    WHERE e.id = $1
    `,
    [employeeId]
  );

  if (rows.length === 0) {
    throw new Error('Employee not found');
  }

  const employee = rows[0];
  if (tenantId && employee.tenant_id && employee.tenant_id !== tenantId) {
    throw new Error('Employee does not belong to this organization');
  }
  return employee;
};

const resolveBasicPay = (employee) => {
  const basic =
    Number(employee.base_pay) ||
    Number(employee.salary) ||
    (Number(employee.compensation_ctc) ? Number(employee.compensation_ctc) / 12 : 0);
  return Number.isFinite(basic) ? basic : 0;
};

export const calculateSettlementPreview = async ({
  employeeId,
  tenantId,
  type,
  proposedLastWorkingDate,
  asOfDate,
}) => {
  const employee = await fetchEmployeeComp(employeeId, tenantId);
  const lwd = normalizeDate(proposedLastWorkingDate) || normalizeDate(employee.last_working_day) || new Date();
  const asOf = normalizeDate(asOfDate) || new Date();
  const doj = normalizeDate(employee.join_date);
  const serviceYears = yearsBetween(doj, lwd);
  const basicPay = resolveBasicPay(employee);
  const noticeDays = employee.notice_period_days ? Number(employee.notice_period_days) : DEFAULT_NOTICE_DAYS;
  const noticeFactor = type === 'resignation' ? 0 : 1;
  const noticePayAmount = (basicPay / 30) * noticeDays * noticeFactor;
  const gratuityEligible = serviceYears >= 5;
  const gratuityAmount = gratuityEligible ? ((basicPay * 15) / 26) * serviceYears : 0;
  const retrenchmentEligible = type === 'retrenchment' || type === 'redundancy';
  const retrenchmentComp =
    retrenchmentEligible ? ((basicPay * DEFAULT_RETR_DAILY_DAYS) / 26) * Math.max(serviceYears, 1) : 0;
  const leaveEncashAmount = 0;
  const lines = [
    {
      code: 'NOTICE_PAY',
      label: 'Notice pay in lieu',
      amount: Math.round(noticePayAmount),
      meta: { notice_days: noticeDays },
    },
    {
      code: 'GRATUITY',
      label: 'Gratuity (indicative)',
      amount: Math.round(gratuityAmount),
      meta: { years_of_service: serviceYears, eligible: gratuityEligible },
    },
    {
      code: 'RETRENCHMENT',
      label: 'Retrenchment compensation',
      amount: Math.round(retrenchmentComp),
      meta: { eligible: retrenchmentEligible },
    },
    {
      code: 'LEAVE_ENCASH',
      label: 'Leave encashment',
      amount: Math.round(leaveEncashAmount),
      meta: {},
    },
  ];
  const total = lines.reduce((sum, line) => sum + (line.amount || 0), 0);
  return {
    employeeId,
    type,
    asOf,
    proposedLastWorkingDate: lwd,
    noticeDays,
    serviceYears,
    lines,
    totals: {
      gross: total,
      payable: total,
    },
  };
};


