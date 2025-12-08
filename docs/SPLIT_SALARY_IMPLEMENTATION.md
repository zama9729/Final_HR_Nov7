# Split Salary Implementation (Partial Salary Release + Final Settlement)

This document describes the flow for paying part of the salary early (e.g., ₹30k now, balance later) while keeping a single final payslip for the full salary.

## Run Types
- **regular**: Full salary calculation and final settlement (payslips generated).
- **off_cycle**: Bonus/adhoc payments (existing behavior).
- **partial_payment**: Interim salary payout with no tax/deductions; payslips are not generated for this run.

## Workflow
1) **Create Partial Run**
   - In Create Payroll dialog, choose `Partial Salary Release`.
   - Partial run skips base components; only adjustments/entered amounts are paid out.
   - In Review dialog, only “Partial Payout Amount” is shown/editable; taxes/deductions are hidden.
   - Bank export uses the partial payout amounts; no payslips are generated.

2) **Process Partial Run**
   - Process the run to disburse the interim amount.

3) **Create Final Regular Run**
   - Choose `regular`.
   - System calculates full salary and full deductions.
   - Any completed `partial_payment` amounts in the same period are auto-deducted from the net payable.
   - Metadata stores `interim_payment_cents` for payslip display.

4) **Payslip**
   - Generated only in the regular run.
   - Shows full earnings/deductions and a line item “Less: Interim Payment” reflecting the deducted partial payout.

## Notes
- Partial runs set `gross = 0`, `deductions = 0`, `net = sum(adjustments)` (net payable only).
- Regular runs subtract prior partial payments (not bonuses) from net pay; interim amount is recorded in metadata.
- Payslip dialog hides generation for `partial_payment` runs. Use bank file/payment advice instead.

