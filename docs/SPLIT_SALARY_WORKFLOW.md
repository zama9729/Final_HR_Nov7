# Split Salary / Partial Payout Workflow

This guide explains how to pay employees in two parts when cash is limited (e.g., pay ₹30k now and the balance later).

## Overview
1. Create an **Off-Cycle** run for the first partial payment.
2. Apply a **uniform payout** adjustment to all employees (e.g., ₹30,000).
3. Process the Off-Cycle run.
4. Create a **Regular** run later; the system auto-deducts what was already paid in the off-cycle run.

## Steps
### 1) Create Off-Cycle Run
- Start a new payroll run with type **off_cycle**.
- Off-cycle runs start with **0 gross salary**—only adjustments count toward pay.

### 2) Apply Uniform Payout
- Open the **Payroll Review** dialog for the off-cycle run.
- Click **Bulk Actions → Set Uniform Payout**.
- Enter:
  - **Amount**: e.g., `30000`
  - **Component Name**: defaults to `Partial Salary Release` (you can change it).
- Confirm to add a **taxable adjustment** for every visible (non-held) employee. Live recalculation updates totals immediately.

### 3) Process the Off-Cycle Run
- Click **Process Payroll**. The bank file and totals will match the adjustments applied.

### 4) Run the Final (Regular) Cycle
- Create a **regular** run for the same period.
- The system automatically **deducts any net pay already issued** in completed off-cycle runs within the period, so only the remaining balance is paid.

## Notes & Constraints
- Off-cycle runs skip standard earnings/deductions (Basic, HRA, PF, ESI, etc.). Pay comes solely from adjustments.
- Bulk payout is **taxable** by default; adjust manually if you need a non-taxable component.
- Bulk action uses best-effort requests (`Promise.allSettled`); any failures are reported. Re-run bulk or add individual adjustments for failed employees.
- Use the existing **hold** toggle to exclude specific employees before running the bulk action.

