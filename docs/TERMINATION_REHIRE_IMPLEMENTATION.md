## Termination / Rehire / Background-Check — Implementation Plan

### 1. Scope Overview
- Feature flag: `termination_rehire_v1` (backend middleware + frontend route guards).
- Modules:
  - Terminations (resignation, termination for cause, retrenchment/layoff, redundancy, mutual separation).
  - Background checks (pre-hire, rehire, periodic) with consent + vendor integration.
  - Rehire workflow with eligibility engine and DO_NOT_REHIRE governance.
- Cross-cutting: audit logging, statutory calculations, document templates, retention configuration, notifications, payroll integration.

### 2. Architecture Layers
| Layer | Additions |
| --- | --- |
| Database | New tables for `terminations`, `termination_audit`, `termination_documents`, `termination_checklist_items`, `rehire_requests`, `rehire_actions`, `background_checks`, `background_check_events`, `consent_records`, `do_not_rehire_flags`, `labour_notifications`. |
| Services | Settlement calculator, notice-period resolver, background vendor client, rehire eligibility engine, consent service, document/PDF generator, audit logger. |
| APIs | `/api/terminations*`, `/api/background-checks*`, `/api/rehire-requests*`, `/api/consent`, `/api/notifications/labour`. |
| Frontend | React wizard pages: Termination Studio, Background Check Console, Rehire Desk, DO_NOT_REHIRE admin table. Shared components for steppers, approval timelines, consent capture, settlement preview, checklist tracker. |
| Integrations | Payroll (final settlement + gratuity + arrears), IT asset service, notification templates (email/PDF), vendor webhooks. |

### 3. Data Model (initial draft)

#### 3.1 Terminations
```
terminations (
  id UUID PK,
  employee_id UUID FK employees,
  type TEXT CHECK ENUM('resignation','cause','retrenchment','redundancy','mutual'),
  initiator_id UUID,
  initiator_role TEXT,
  reason_text TEXT,
  evidence_refs JSONB,
  proposed_lwd DATE,
  final_lwd DATE,
  notice_days INT,
  notice_source TEXT,
  notice_pay_amount NUMERIC(12,2),
  gratuity_amount NUMERIC(12,2),
  retrenchment_comp_amount NUMERIC(12,2),
  leave_encash_amount NUMERIC(12,2),
  settlement_amount NUMERIC(12,2),
  currency CHAR(3),
  consent_snapshot_id UUID NULL,
  dispute_status TEXT CHECK ENUM('none','raised','resolved'),
  status TEXT CHECK ENUM('initiated','manager_review','hr_review','legal_review','payroll_hold','completed','rejected'),
  created_by UUID,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  closed_at timestamptz
)
```
Supporting tables: `termination_audit`, `termination_checklist_items`, `termination_documents`, `termination_disputes`, `labour_notifications`.

#### 3.2 Background Checks
```
background_checks (
  id UUID PK,
  candidate_id UUID NULL,
  employee_id UUID NULL,
  type TEXT CHECK ENUM('prehire','rehire','periodic'),
  vendor_id UUID,
  scope JSONB,
  consent_snapshot JSONB,
  request_payload JSONB,
  result_summary JSONB,
  raw_report_url TEXT,
  status TEXT CHECK ENUM('pending','in_progress','vendor_delay','completed_green','completed_amber','completed_red','cancelled'),
  retention_until DATE,
  created_by UUID,
  created_at timestamptz,
  completed_at timestamptz
)
```
Events table stores every step and vendor webhook.

#### 3.3 Rehire
```
rehire_requests (
  id UUID PK,
  ex_employee_id UUID,
  requested_by UUID,
  requested_start_date DATE,
  prior_termination_id UUID,
  eligibility_status TEXT CHECK ENUM('eligible','ineligible','needs_review','pending_checks'),
  eligibility_reason TEXT,
  rehire_policy_snapshot JSONB,
  approvals JSONB,
  rehire_flags JSONB,
  background_check_id UUID NULL,
  onboarding_employee_id UUID NULL,
  status TEXT CHECK ENUM('draft','awaiting_checks','offer','onboarding','completed','rejected'),
  created_at timestamptz,
  updated_at timestamptz
)
```
Add `do_not_rehire_flags` with reason, attachments, authorizer.

### 4. Workflow Blueprints

#### 4.1 Termination Wizard
1. Initiation: collect type, reason, attachments; create record (status `initiated`).
2. Validation: service calculates notice and settlement preview using payroll + leave data, exposes `/preview_settlement`.
3. Approval flows (config-driven). Example for termination for cause: manager → HR → disciplinary panel → Legal → OrgAdmin.
4. Checklist: dynamic tasks (IT assets, client comms, LWF forms). Each completion tracked in `termination_checklist_items`.
5. Payroll integration: generate settlement payload, freeze pay period, push to payroll API, produce PDF (settlement statement + relieving letter).
6. Closure: disable access, log final audit, optionally mark DO_NOT_REHIRE.

#### 4.2 Background Checks
- Consent capture before request; store `consent_snapshot`.
- `background_vendor_service` handles REST webhook; statuses update events.
- Decision engine maps vendor result to `green/amber/red` and triggers HR review with deadlines (adverse action).
- Retention job purges reports past retention horizon (config per org).

#### 4.3 Rehire
- Eligibility engine evaluating previous exit reason, DO_NOT_REHIRE, cool-off days, outstanding disputes, pending settlements.
- If eligible, require new background check (or recorded waiver with approvals).
- Offer step integrates with existing onboarding; option to reinstate tenure toggles `service_restart`.
- Document payroll actions (PF UAN reuse, ESIC updates).

### 5. APIs (v1)
| Method | Endpoint | Notes |
| --- | --- | --- |
| POST | `/api/terminations` | Create request (flag guard). |
| GET | `/api/terminations/:id` | Includes timeline, checklists. |
| GET | `/api/terminations/:id/preview_settlement` | Accept `as_of` query param. |
| POST | `/api/terminations/:id/approve` | Body includes action, note, attachments; RBAC enforced. |
| POST | `/api/terminations/:id/complete` | Final payroll + document generation. |
| POST | `/api/terminations/:id/dispute` | Employee raises dispute. |
| POST | `/api/background-checks` | Kickoff with consent token or inline consent. |
| GET | `/api/background-checks/:id/report` | Streams PDF/JSON; redactions per RBAC. |
| POST | `/api/background-checks/:id/events/vendor-webhook` | Vendor callback (signed). |
| POST | `/api/rehire-requests` | Start rehire; returns eligibility summary. |
| POST | `/api/rehire-requests/:id/eligibility/recompute` | For changed policies. |
| POST | `/api/rehire-requests/:id/decision` | Approve/reject/hold. |
| GET | `/api/admin/do-not-rehire` | List flagged individuals (HR only). |

### 6. Frontend Deliverables
1. **Termination Studio** (`/terminations`):
   - Stepper wizard (Initiation → Validation → Approvals → Checklist → Settlement → Close).
   - Settlement preview card with notice/gratuity formulas and legal disclaimers.
   - Evidence uploader, investigation timeline, legal sign-off modal.
2. **Background Check Console** (`/background-checks`):
   - Consent capture modal (IP, UA, signature text).
   - Status board for each verification line (identity, education, employment, criminal, sanctions).
   - Vendor report viewer + adverse action workflow UI.
3. **Rehire Desk** (`/rehire`):
   - Candidate search + prior employment timeline.
   - Eligibility indicator + blocking reasons.
   - Config toggles for tenure reinstatement, PF linkage.
4. **Admin Panels**:
   - DO_NOT_REHIRE registry.
   - Retention policy settings.
   - Legal template manager (retrenchment notices, relieving letters, adverse action letters).

All new pages gated by feature flag + RBAC (HRBP, OrgAdmin, Legal, Payroll).

### 7. Legal & Compliance Hooks
- Configurable thresholds for automatic legal review (e.g., retrenchment > X employees).
- Template library stored in DB with versioning; render via PDFKit/wkhtmltopdf.
- Audit logger writes to `termination_audit`, `background_check_events`, `rehire_actions`.
- Consent data stored with hash + immutable blob for legal defensibility.
- Data retention scheduler (cron) prunes expired background reports and archives termination bundles to cold storage.

### 8. Testing Strategy
- Unit tests for settlement calculator (notice pay, gratuity examples, retrenchment compensation).
- API tests for approval chains (role gating, invalid transitions).
- Vendor webhook mock tests for background checks.
- Frontend Cypress flows for wizard progression, consent capture, rehire eligibility gating.
- Snapshot tests for PDF generation (structure, placeholders).

#### Manual smoke checklist (current sprint)
- [ ] `POST /api/terminations` → returns status + preview hook, stage progression works via `/approve`.
- [ ] `/api/terminations/:id/preview_settlement` matches expected formula for seeded employee.
- [ ] `/api/background-checks` create path stores consent text + scope JSON; report dialog renders statuses.
- [ ] `/api/rehire` creation enforces DO_NOT_REHIRE + cool-off logic.

Run `npm run seed:termination-demo` to load:
- 1 demo termination (`status = manager_review`).
- 1 background check (`status = in_progress`).
- 1 rehire request (`status = awaiting_checks`, `eligibility_status = eligible`).

### 9. Rollout Plan
1. Ship schema migrations + backend APIs behind feature flag.
2. Seed default legal templates and retention configs.
3. Release internal-only UI (flagged) for pilot HR team.
4. Train payroll + legal teams; import DO_NOT_REHIRE legacy data.
5. Enable for broader org after legal sign-off; monitor audit logs + vendor calls.

Operational checklist:
- Toggle feature flag per org via `TERMINATION_REHIRE_V1`.
- Backfill existing terminations with minimal rows (use migration helper or manual insert) so history can be displayed.
- Share legal doc pack (retrenchment notices, relieving letter) before enabling payroll hold stage.
- Document vendor API keys and callback URLs in secure config (background-check service expects `vendor_id` references).

### 10. Open Questions / Follow-ups
- Vendor integration specifics (REST vs SFTP) and authentication (API keys, IP allow list).
- Labour authority notification thresholds by state (config file vs per org policy).
- Document storage approach for immutable evidence (existing S3 bucket?).
- Whether retrenchment compensation formula needs custom overrides per org.
- Need for multi-language templates (English + local languages?).

---
This plan will be updated as we implement each sub-module. Next steps: create DB migrations, scaffolding routes/controllers, then iterate through the workflows feature-by-feature.

