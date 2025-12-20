# HR Platform - User Roles & Approval Flowcharts

## Overview
This document shows what each user role can do and how approvals flow through the system. **Red text indicates missing features or bottlenecks** that need work.

---

## User Roles Hierarchy

```
┌─────────────┐
│   Admin     │ ← Full access to everything
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    CEO      │ ← Organization-wide approvals
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Director   │ ← Department-wide approvals
└──────┬──────┘
       │
       ▼
┌─────────────┐
│     HR      │ ← HR operations & approvals
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Manager    │ ← Team approvals
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Employee   │ ← Basic user
└─────────────┘
```

---

## 1. Employee Role - What They Can Do

```mermaid
flowchart TD
    Start([Employee Logs In]) --> Dashboard[View Dashboard]
    
    Dashboard --> Timesheet[Create/Edit Timesheet]
    Timesheet --> SubmitTS[Submit Timesheet]
    SubmitTS --> WaitApproval[Wait for Manager Approval]
    
    Dashboard --> Leave[Request Leave]
    Leave --> SubmitLeave[Submit Leave Request]
    SubmitLeave --> WaitLeaveApproval[Wait for Manager/HR Approval]
    
    Dashboard --> SmartMemo[Use Smart Memo]
    SmartMemo --> CreateEvents[Create Calendar Events]
    SmartMemo --> SetReminders[Set Reminders]
    
    Dashboard --> ViewOwn[View Own Profile]
    Dashboard --> ViewOwnTimesheet[View Own Timesheets]
    Dashboard --> ViewOwnLeave[View Own Leave Balance]
    
    Dashboard --> TaxDec[Tax Declaration]
    TaxDec --> FillTax[Fill Tax Details]
    
    Dashboard --> Clock[Clock In/Out]
    
    style WaitApproval fill:#fff9c4
    style WaitLeaveApproval fill:#fff9c4
    style TaxDec fill:#ffcdd2
    style Clock fill:#ffcdd2
```

**Employee Capabilities:**
- ✅ Create & submit timesheets
- ✅ Request leave
- ✅ Use Smart Memo
- ✅ View own profile & data
- ✅ Tax declaration
- ⚠️ **Clock In/Out** - *May need verification*
- ⚠️ **View team calendar** - *Limited access*

---

## 2. Manager Role - What They Can Do

```mermaid
flowchart TD
    Start([Manager Logs In]) --> Dashboard[View Dashboard]
    
    Dashboard --> ApproveTS[Approve Team Timesheets]
    ApproveTS --> CheckTS{Valid?}
    CheckTS -->|Yes| Approve[Approve]
    CheckTS -->|No| Reject[Reject with Reason]
    Approve --> NotifyEmp[Notify Employee]
    Reject --> NotifyEmp
    
    Dashboard --> ApproveLeave[Approve Team Leave Requests]
    ApproveLeave --> CheckLeave{Valid?}
    CheckLeave -->|Yes| ApproveL[Approve Leave]
    CheckLeave -->|No| RejectL[Reject Leave]
    
    Dashboard --> ViewTeam[View Team Members]
    Dashboard --> ViewTeamTS[View Team Timesheets]
    Dashboard --> ViewTeamLeave[View Team Leave Calendar]
    
    Dashboard --> CreateTS[Create Own Timesheet]
    Dashboard --> RequestLeave[Request Own Leave]
    
    Dashboard --> OrgChart[View Org Chart]
    Dashboard --> Appraisals[Conduct Appraisals]
    
    style ApproveTS fill:#c8e6c9
    style ApproveLeave fill:#c8e6c9
    style Appraisals fill:#ffcdd2
    style OrgChart fill:#ffcdd2
```

**Manager Capabilities:**
- ✅ Approve team timesheets
- ✅ Approve team leave requests
- ✅ View team data
- ✅ Create own timesheets/leave
- ⚠️ **Appraisals** - *May need verification*
- ⚠️ **Team performance metrics** - *May be missing*

---

## 3. HR Role - What They Can Do

```mermaid
flowchart TD
    Start([HR Logs In]) --> Dashboard[View Dashboard]
    
    Dashboard --> ManageEmp[Manage Employees]
    ManageEmp --> AddEmp[Add New Employee]
    ManageEmp --> EditEmp[Edit Employee]
    ManageEmp --> Terminate[Terminate Employee]
    
    Dashboard --> ApproveAll[Approve Any Timesheet]
    ApproveAll --> OverrideTS[Override Manager Decision]
    
    Dashboard --> ApproveLeaveHR[Approve Any Leave]
    ApproveLeaveHR --> OverrideLeave[Override Leave Decision]
    
    Dashboard --> Onboarding[Manage Onboarding]
    Dashboard --> Policies[Create/Edit Policies]
    Dashboard --> Holidays[Manage Holidays]
    Dashboard --> Shifts[Manage Shifts]
    
    Dashboard --> UploadAtt[Upload Attendance]
    Dashboard --> Analytics[View Analytics]
    Dashboard --> Reports[Generate Reports]
    
    Dashboard --> Workflows[Manage Workflows]
    Dashboard --> AuditLogs[View Audit Logs]
    
    style OverrideTS fill:#fff9c4
    style OverrideLeave fill:#fff9c4
    style Workflows fill:#ffcdd2
    style AuditLogs fill:#ffcdd2
    style Reports fill:#ffcdd2
```

**HR Capabilities:**
- ✅ Full employee management
- ✅ Approve any timesheet/leave
- ✅ Override manager decisions
- ✅ Manage policies & holidays
- ✅ Upload attendance
- ⚠️ **Workflows** - *May need verification*
- ⚠️ **Audit Logs** - *May need verification*
- ⚠️ **Advanced Reports** - *May be missing*

---

## 4. Director Role - What They Can Do

```mermaid
flowchart TD
    Start([Director Logs In]) --> Dashboard[View Dashboard]
    
    Dashboard --> DeptApprovals[Department Approvals]
    DeptApprovals --> ApproveDeptTS[Approve Department Timesheets]
    DeptApprovals --> ApproveDeptLeave[Approve Department Leave]
    
    Dashboard --> ViewDept[View Department Data]
    ViewDept --> ViewDeptEmp[View Department Employees]
    ViewDept --> ViewDeptAnalytics[View Department Analytics]
    
    Dashboard --> ProjectAlloc[Project Allocation]
    ProjectAlloc --> AssignProjects[Assign Projects to Team]
    
    Dashboard --> OnboardingDept[Department Onboarding]
    Dashboard --> BGCheck[Background Check View]
    
    Dashboard --> CreateTS[Create Own Timesheet]
    Dashboard --> RequestLeave[Request Own Leave]
    
    style ApproveDeptTS fill:#c8e6c9
    style ApproveDeptLeave fill:#c8e6c9
    style ProjectAlloc fill:#ffcdd2
    style BGCheck fill:#ffcdd2
    style ViewDeptAnalytics fill:#ffcdd2
```

**Director Capabilities:**
- ✅ Department-wide approvals
- ✅ View department data
- ✅ Project allocation
- ⚠️ **Department Analytics** - *May be missing*
- ⚠️ **Background Check View** - *May need verification*

---

## 5. CEO Role - What They Can Do

```mermaid
flowchart TD
    Start([CEO Logs In]) --> Dashboard[View Dashboard]
    
    Dashboard --> OrgApprovals[Organization Approvals]
    OrgApprovals --> ApproveOrgLeave[Approve Any Leave]
    OrgApprovals --> OverrideAny[Override Any Decision]
    
    Dashboard --> ViewAll[View All Data]
    ViewAll --> ViewAllEmp[View All Employees]
    ViewAll --> ViewAllTS[View All Timesheets]
    ViewAll --> ViewAllAnalytics[View All Analytics]
    
    Dashboard --> PayrollView[View Payroll Totals]
    Dashboard --> PoliciesView[View Policies]
    
    Dashboard --> BreakGlass[Break Glass Override]
    BreakGlass --> EmergencyAccess[Emergency Access to Anything]
    
    Dashboard --> CreateTS[Create Own Timesheet]
    Dashboard --> RequestLeave[Request Own Leave]
    
    style ApproveOrgLeave fill:#c8e6c9
    style OverrideAny fill:#fff9c4
    style BreakGlass fill:#ffcdd2
    style ViewAllAnalytics fill:#ffcdd2
    style PayrollView fill:#ffcdd2
```

**CEO Capabilities:**
- ✅ Organization-wide approvals
- ✅ View all data
- ✅ Override any decision
- ⚠️ **Break Glass Override** - *May need implementation*
- ⚠️ **Payroll Totals View** - *May need verification*
- ⚠️ **Organization Analytics** - *May be missing*

---

## 6. Admin Role - What They Can Do

```mermaid
flowchart TD
    Start([Admin Logs In]) --> Dashboard[View Dashboard]
    
    Dashboard --> Everything[Everything!]
    Everything --> AllFeatures[All Features]
    Everything --> AllApprovals[All Approvals]
    Everything --> AllSettings[All Settings]
    Everything --> UserManagement[User Management]
    Everything --> SystemConfig[System Configuration]
    
    style Everything fill:#c8e6c9
    style AllFeatures fill:#c8e6c9
    style AllApprovals fill:#c8e6c9
    style AllSettings fill:#c8e6c9
    style UserManagement fill:#c8e6c9
    style SystemConfig fill:#c8e6c9
```

**Admin Capabilities:**
- ✅ **Full access to everything**
- ✅ All features
- ✅ All approvals
- ✅ System configuration
- ✅ User management

---

## 7. Timesheet Approval Flow

```mermaid
flowchart TD
    Start([Employee Submits Timesheet]) --> Status1[Status: pending_approval]
    
    Status1 --> HasManager{Has Manager?}
    
    HasManager -->|Yes| ManagerReview[Manager Reviews]
    ManagerReview --> ManagerDecision{Approve or Reject?}
    ManagerDecision -->|Approve| Status2[Status: approved]
    ManagerDecision -->|Reject| Status3[Status: rejected]
    Status3 --> NotifyEmp1[Notify Employee]
    NotifyEmp1 --> EmployeeFixes[Employee Fixes & Resubmits]
    EmployeeFixes --> Status1
    
    HasManager -->|No| HRReview[HR Reviews]
    HRReview --> HRDecision{Approve or Reject?}
    HRDecision -->|Approve| Status2
    HRDecision -->|Reject| Status3
    
    Status2 --> Payroll[Ready for Payroll]
    
    style ManagerReview fill:#fff9c4
    style HRReview fill:#fff9c4
    style Payroll fill:#c8e6c9
    style NotifyEmp1 fill:#ffcdd2
    style EmployeeFixes fill:#ffcdd2
```

**Bottlenecks Identified:**
- ⚠️ **No automatic notification to manager** - *Red*
- ⚠️ **No escalation if manager doesn't approve** - *Red*
- ⚠️ **No multi-level approval** - *Red*
- ⚠️ **No deadline reminders** - *Red*

---

## 8. Leave Approval Flow

```mermaid
flowchart TD
    Start([Employee Requests Leave]) --> Status1[Status: pending]
    
    Status1 --> CheckType{Leave Type?}
    
    CheckType -->|Short Leave| ManagerReview[Manager Reviews]
    CheckType -->|Long Leave| HRReview[HR Reviews]
    CheckType -->|Special Leave| CEOReview[CEO Reviews]
    
    ManagerReview --> ManagerDecision{Approve or Reject?}
    ManagerDecision -->|Approve| Status2[Status: approved]
    ManagerDecision -->|Reject| Status3[Status: rejected]
    
    HRReview --> HRDecision{Approve or Reject?}
    HRDecision -->|Approve| Status2
    HRDecision -->|Reject| Status3
    
    CEOReview --> CEODecision{Approve or Reject?}
    CEODecision -->|Approve| Status2
    CEODecision -->|Reject| Status3
    
    Status2 --> UpdateBalance[Update Leave Balance]
    Status3 --> NotifyEmp[Notify Employee]
    
    style ManagerReview fill:#fff9c4
    style HRReview fill:#fff9c4
    style CEOReview fill:#fff9c4
    style UpdateBalance fill:#c8e6c9
    style NotifyEmp fill:#ffcdd2
```

**Bottlenecks Identified:**
- ⚠️ **No automatic leave balance check** - *Red*
- ⚠️ **No conflict detection (overlapping leaves)** - *Red*
- ⚠️ **No team coverage check** - *Red*
- ⚠️ **No automatic calendar blocking** - *Red*

---

## 9. Complete System Features by Role

```mermaid
flowchart LR
    subgraph Features["System Features"]
        TS[Timesheets]
        Leave[Leave Management]
        Emp[Employee Management]
        Att[Attendance]
        Payroll[Payroll]
        Tax[Tax Declaration]
        SmartMemo[Smart Memo]
        Calendar[Calendar]
        Analytics[Analytics]
        Reports[Reports]
        Policies[Policies]
        Onboarding[Onboarding]
        Appraisals[Appraisals]
        Projects[Projects]
        Workflows[Workflows]
    end
    
    subgraph Roles["Roles"]
        EmpRole[Employee]
        Mgr[Manager]
        HR[HR]
        Dir[Director]
        CEO[CEO]
        Admin[Admin]
    end
    
    EmpRole --> TS
    EmpRole --> Leave
    EmpRole --> SmartMemo
    EmpRole --> Calendar
    EmpRole --> Tax
    
    Mgr --> TS
    Mgr --> Leave
    Mgr --> Emp
    Mgr --> Calendar
    Mgr --> Appraisals
    
    HR --> TS
    HR --> Leave
    HR --> Emp
    HR --> Att
    HR --> Policies
    HR --> Onboarding
    HR --> Analytics
    HR --> Reports
    HR --> Workflows
    
    Dir --> TS
    Dir --> Leave
    Dir --> Emp
    Dir --> Projects
    Dir --> Analytics
    
    CEO --> TS
    CEO --> Leave
    CEO --> Payroll
    CEO --> Analytics
    
    Admin --> TS
    Admin --> Leave
    Admin --> Emp
    Admin --> Att
    Admin --> Payroll
    Admin --> Tax
    Admin --> SmartMemo
    Admin --> Calendar
    Admin --> Analytics
    Admin --> Reports
    Admin --> Policies
    Admin --> Onboarding
    Admin --> Appraisals
    Admin --> Projects
    Admin --> Workflows
    
    style Workflows fill:#ffcdd2
    style Reports fill:#ffcdd2
    style Appraisals fill:#ffcdd2
    style Projects fill:#ffcdd2
```

---

## 10. Approval Bottlenecks & Missing Features

### Timesheet Approval Bottlenecks

```
┌─────────────────────────────────────────┐
│  Timesheet Approval Issues              │
├─────────────────────────────────────────┤
│  ❌ No automatic notification           │
│  ❌ No escalation mechanism             │
│  ❌ No deadline reminders                │
│  ❌ No multi-level approval              │
│  ❌ No approval history                  │
│  ❌ No bulk approval                     │
│  ❌ No approval dashboard                │
└─────────────────────────────────────────┘
```

### Leave Approval Bottlenecks

```
┌─────────────────────────────────────────┐
│  Leave Approval Issues                  │
├─────────────────────────────────────────┤
│  ❌ No automatic balance check          │
│  ❌ No conflict detection                │
│  ❌ No team coverage check               │
│  ❌ No calendar auto-block               │
│  ❌ No delegation support                │
│  ❌ No leave calendar view                │
└─────────────────────────────────────────┘
```

### Missing Features by Role

```
┌─────────────────────────────────────────┐
│  Employee Missing Features              │
├─────────────────────────────────────────┤
│  ❌ Team calendar view (limited)        │
│  ❌ Clock in/out verification            │
│  ❌ Expense reimbursement                │
│  ❌ Performance self-review              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Manager Missing Features               │
├─────────────────────────────────────────┤
│  ❌ Team performance dashboard          │
│  ❌ Appraisal workflow                  │
│  ❌ Team analytics                      │
│  ❌ Approval delegation                 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  HR Missing Features                    │
├─────────────────────────────────────────┤
│  ❌ Advanced reporting                  │
│  ❌ Workflow automation                 │
│  ❌ Audit log viewer                    │
│  ❌ Compliance tracking                 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Director/CEO Missing Features         │
├─────────────────────────────────────────┤
│  ❌ Department/Org analytics           │
│  ❌ Executive dashboard                 │
│  ❌ Strategic reports                   │
│  ❌ Break glass override                │
└─────────────────────────────────────────┘
```

---

## 11. Simple Approval Flow Summary

```
Employee Action → Submit → Pending Approval
                      │
                      ▼
              ┌───────────────┐
              │ Who Approves? │
              └───────┬───────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
    Manager         HR            CEO
    (Team)      (Override)    (Org-wide)
        │             │             │
        └─────────────┼─────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Approved or   │
              │   Rejected    │
              └───────┬───────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
    Approved      Rejected      Notify
        │             │         Employee
        │             │             │
        ▼             ▼             ▼
    Process      Fix &        Resubmit
    (Payroll)    Resubmit
```

---

## 12. Quick Reference - Who Can Approve What?

| Action | Employee | Manager | HR | Director | CEO | Admin |
|--------|----------|---------|----|----------|----|----|
| Own Timesheet | Submit | - | Approve | Approve | Approve | Approve |
| Team Timesheet | - | Approve | Override | Override | Override | Approve |
| Own Leave | Request | - | Approve | Approve | Approve | Approve |
| Team Leave | - | Approve | Override | Override | Override | Approve |
| Add Employee | - | - | ✅ | - | - | ✅ |
| Edit Employee | Own | - | ✅ | Dept | - | ✅ |
| View Analytics | Own | Team | All | Dept | All | All |
| Manage Policies | - | - | ✅ | View | View | ✅ |

**Legend:**
- ✅ = Full access
- View = Read-only
- - = No access

---

## Recommendations for Enhancement

### Priority 1 (Critical Bottlenecks)
1. **Automatic Notifications** - Notify approvers when items pending
2. **Approval Deadlines** - Set deadlines with reminders
3. **Escalation** - Auto-escalate if not approved in time
4. **Approval Dashboard** - Central view of all pending approvals

### Priority 2 (Missing Features)
1. **Multi-level Approval** - Support multiple approval stages
2. **Delegation** - Allow approvers to delegate
3. **Bulk Operations** - Approve/reject multiple items
4. **Approval History** - Track all approval actions

### Priority 3 (Enhancements)
1. **Analytics Dashboards** - Role-specific analytics
2. **Advanced Reports** - Custom report generation
3. **Workflow Automation** - Automated approval workflows
4. **Mobile Notifications** - Push notifications for approvals

---

**Last Updated**: December 2025  
**Status**: Active Development











