# HR Platform - System Flowcharts

This document contains detailed flowcharts for all major features of the HR Platform.

## Table of Contents
1. [Two-Step Email-First Login Flow](#1-two-step-email-first-login-flow)
2. [Smart Memo Processing Flow](#2-smart-memo-processing-flow)
3. [Reminder System Flow](#3-reminder-system-flow)
4. [Timesheet Submission Flow](#4-timesheet-submission-flow)
5. [Notification System Flow](#5-notification-system-flow)

---

## 1. Two-Step Email-First Login Flow

```mermaid
flowchart TD
    Start([User Opens Login Page]) --> EmailInput[Enter Email Address]
    EmailInput --> ValidateEmail{Email Valid?}
    ValidateEmail -->|No| ShowError[Show Email Error]
    ShowError --> EmailInput
    ValidateEmail -->|Yes| CheckEmail[POST /api/auth/check-email]
    CheckEmail --> UserExists{User Exists?}
    UserExists -->|No| ShowNotFound[Show: Account Not Found<br/>+ Sign Up Button]
    ShowNotFound --> SignUp[Redirect to Signup]
    UserExists -->|Yes| CheckPassword{Password Set?}
    CheckPassword -->|No| FirstTimeSetup[Show First-Time Setup Form]
    CheckPassword -->|Yes| PasswordForm[Show Password Form]
    
    FirstTimeSetup --> EnterNewPassword[Enter New Password]
    EnterNewPassword --> ConfirmPassword[Confirm Password]
    ConfirmPassword --> ValidatePassword{Passwords Match<br/>& Length >= 8?}
    ValidatePassword -->|No| ShowPasswordError[Show Password Error]
    ShowPasswordError --> EnterNewPassword
    ValidatePassword -->|Yes| FirstTimeAPI[POST /api/auth/first-time-setup]
    FirstTimeAPI --> CreatePassword[Create Password Hash]
    CreatePassword --> GenerateToken1[Generate JWT Token]
    GenerateToken1 --> LoginSuccess1[Login Success<br/>Navigate to Dashboard]
    
    PasswordForm --> EnterPassword[Enter Password]
    EnterPassword --> LoginAPI[POST /api/auth/login]
    LoginAPI --> VerifyPassword{Password Valid?}
    VerifyPassword -->|No| ShowLoginError[Show Login Error]
    ShowLoginError --> EnterPassword
    VerifyPassword -->|Yes| CheckEmployeePassword{Employee Must<br/>Change Password?}
    CheckEmployeePassword -->|Yes| RedirectFirstTime[Redirect to First-Time Login]
    CheckEmployeePassword -->|No| GenerateToken2[Generate JWT Token]
    GenerateToken2 --> LoginSuccess2[Login Success<br/>Navigate to Dashboard]
    
    style Start fill:#e1f5ff
    style LoginSuccess1 fill:#c8e6c9
    style LoginSuccess2 fill:#c8e6c9
    style ShowError fill:#ffcdd2
    style ShowNotFound fill:#ffcdd2
    style ShowPasswordError fill:#ffcdd2
    style ShowLoginError fill:#ffcdd2
```

---

## 2. Smart Memo Processing Flow

```mermaid
flowchart TD
    Start([User Enters Smart Memo Text]) --> InputText[Textarea Input:<br/>11-12 in meeting, 13-15 worked on issues<br/>remind me in 30 minutes]
    InputText --> PreviewClick{User Clicks<br/>Preview?}
    PreviewClick -->|Yes| ParseText[Parse Smart Memo Text]
    PreviewClick -->|No| SaveClick{User Clicks<br/>Save to Calendar?}
    
    ParseText --> ExtractReminders[Extract Reminder Commands]
    ExtractReminders --> ParseTimeRanges[Parse Time Ranges]
    ParseTimeRanges --> ValidateEntries{Valid Entries<br/>Found?}
    ValidateEntries -->|No| ShowError[Show Error:<br/>No valid entries]
    ShowError --> InputText
    ValidateEntries -->|Yes| ShowPreview[Show Preview Dialog<br/>with Parsed Entries]
    ShowPreview --> ConfirmSave{User Confirms<br/>Save?}
    ConfirmSave -->|No| InputText
    ConfirmSave -->|Yes| SaveClick
    
    SaveClick -->|Yes| ParseText2[Parse Smart Memo Text]
    ParseText2 --> ExtractReminders2[Extract Reminder Commands]
    ExtractReminders2 --> ParseTimeRanges2[Parse Time Ranges]
    ParseTimeRanges2 --> ValidateEntries2{Valid Entries<br/>or Reminders?}
    ValidateEntries2 -->|No| ShowError2[Show Error]
    ShowError2 --> InputText
    ValidateEntries2 -->|Yes| APICall[POST /api/calendar/smart-memo]
    
    APICall --> GetTenant[Get Tenant ID]
    GetTenant --> GetEmployee[Get Employee ID]
    GetEmployee --> EnsureTables[Ensure Tables Exist:<br/>team_schedule_events, reminders]
    EnsureTables --> SetupRLS[Setup Row Level Security]
    
    SetupRLS --> ProcessEntries{Has Calendar<br/>Entries?}
    ProcessEntries -->|Yes| LoopEntries[For Each Entry]
    LoopEntries --> CreateEvent[Insert into team_schedule_events<br/>with RLS]
    CreateEvent --> NextEntry{More Entries?}
    NextEntry -->|Yes| LoopEntries
    NextEntry -->|No| ProcessReminders
    
    ProcessEntries -->|No| ProcessReminders{Has Reminders?}
    ProcessReminders -->|Yes| LoopReminders[For Each Reminder]
    LoopReminders --> CreateReminder[Insert into reminders table]
    CreateReminder --> NextReminder{More Reminders?}
    NextReminder -->|Yes| LoopReminders
    NextReminder -->|No| ReturnSuccess
    
    ProcessReminders -->|No| ReturnSuccess[Return Success Response]
    ReturnSuccess --> DispatchEvent[Dispatch 'reminder-created' Event]
    DispatchEvent --> ShowToast[Show Success Toast]
    ShowToast --> ClearInput[Clear Textarea]
    ClearInput --> RefreshCalendar[Refresh Calendar View]
    
    style Start fill:#e1f5ff
    style ReturnSuccess fill:#c8e6c9
    style ShowError fill:#ffcdd2
    style ShowError2 fill:#ffcdd2
    style CreateEvent fill:#fff9c4
    style CreateReminder fill:#fff9c4
```

### Smart Memo Parsing Logic

```mermaid
flowchart TD
    Start([Parse Smart Memo Text]) --> SplitByComma[Split Text by Commas]
    SplitByComma --> LoopSegments[For Each Segment]
    LoopSegments --> TryPattern1{Match Pattern 1:<br/>HH:MM-HH:MM description?}
    TryPattern1 -->|Yes| ExtractTime1[Extract Start/End Times]
    ExtractTime1 --> ValidateTime1{Start < End?}
    ValidateTime1 -->|Yes| CreateEntry1[Create ParsedEntry]
    ValidateTime1 -->|No| SkipSegment1[Skip Invalid]
    
    TryPattern1 -->|No| TryPattern2{Match Pattern 2:<br/>HH-HH description?}
    TryPattern2 -->|Yes| ExtractTime2[Extract Hours<br/>Default Minutes to 00]
    ExtractTime2 --> ValidateTime2{Start < End?}
    ValidateTime2 -->|Yes| CreateEntry2[Create ParsedEntry]
    ValidateTime2 -->|No| SkipSegment2[Skip Invalid]
    
    TryPattern2 -->|No| TryPattern3{Match Pattern 3:<br/>H-HH description?}
    TryPattern3 -->|Yes| ExtractTime3[Extract Hours<br/>Default Minutes to 00]
    ExtractTime3 --> ValidateTime3{Start < End?}
    ValidateTime3 -->|Yes| CreateEntry3[Create ParsedEntry]
    ValidateTime3 -->|No| SkipSegment3[Skip Invalid]
    
    TryPattern3 -->|No| SkipSegment4[Skip - No Match]
    
    CreateEntry1 --> NextSegment
    CreateEntry2 --> NextSegment
    CreateEntry3 --> NextSegment
    SkipSegment1 --> NextSegment
    SkipSegment2 --> NextSegment
    SkipSegment3 --> NextSegment
    SkipSegment4 --> NextSegment
    
    NextSegment{More Segments?} -->|Yes| LoopSegments
    NextSegment -->|No| ReturnEntries[Return Parsed Entries Array]
    
    style Start fill:#e1f5ff
    style ReturnEntries fill:#c8e6c9
    style SkipSegment1 fill:#ffcdd2
    style SkipSegment2 fill:#ffcdd2
    style SkipSegment3 fill:#ffcdd2
    style SkipSegment4 fill:#ffcdd2
```

---

## 3. Reminder System Flow

### 3.1 Reminder Creation Flow

```mermaid
flowchart TD
    Start([User Saves Smart Memo with Reminder]) --> ParseReminder[Parse: remind me in X minutes/hours]
    ParseReminder --> ExtractAmount[Extract Amount & Unit]
    ExtractAmount --> CalculateTime[Calculate remind_at = now + X]
    CalculateTime --> InsertReminder[Insert into reminders table]
    InsertReminder --> ReturnResponse[Return Success]
    ReturnResponse --> DispatchEvent[Dispatch 'reminder-created' Event]
    DispatchEvent --> FrontendListen[Frontend Listens for Event]
    FrontendListen --> FetchReminders[Fetch Active Reminders]
    FetchReminders --> ShowCountdown[Show Countdown Clock Icon]
    
    style Start fill:#e1f5ff
    style ShowCountdown fill:#c8e6c9
```

### 3.2 Reminder Countdown & Notification Flow

```mermaid
flowchart TD
    Start([ReminderCountdown Component Mounted]) --> FetchActive[GET /api/reminders/active]
    FetchActive --> HasReminders{Active Reminders?}
    HasReminders -->|No| HideComponent[Hide Countdown Icon]
    HasReminders -->|Yes| ShowIcon[Show Countdown Icon]
    
    ShowIcon --> StartPolling[Start Polling Every 2 Seconds]
    StartPolling --> ListenEvent[Listen for 'reminder-created' Event]
    ListenEvent --> UpdateCountdown[Update Countdown Every Second]
    
    UpdateCountdown --> CheckTime{remind_at <= now?}
    CheckTime -->|No| CalculateRemaining[Calculate Time Remaining]
    CalculateRemaining --> DisplayTime[Display: MM:SS or Xh Ym]
    DisplayTime --> UpdateCountdown
    CheckTime -->|Yes| PlaySound[Play Beep Beep Sound]
    PlaySound --> ShowToast[Show Toast Notification]
    ShowToast --> RemoveReminder[Remove from UI]
    RemoveReminder --> CheckMore{More Reminders?}
    CheckMore -->|Yes| UpdateCountdown
    CheckMore -->|No| HideComponent
    
    ShowIcon --> UserCancel{User Clicks Cancel?}
    UserCancel -->|Yes| CancelAPI[POST /api/reminders/:id/cancel]
    CancelAPI --> MarkDismissed[Mark is_dismissed = true]
    MarkDismissed --> RemoveFromUI[Remove from UI]
    RemoveFromUI --> CheckMore
    
    style Start fill:#e1f5ff
    style PlaySound fill:#fff9c4
    style ShowToast fill:#c8e6c9
    style HideComponent fill:#ffcdd2
```

### 3.3 Reminder Cron Job Flow

```mermaid
flowchart TD
    Start([Cron Job Scheduled: Every Minute]) --> CheckDue[Query: reminders WHERE<br/>remind_at <= now<br/>AND is_read = false<br/>AND is_dismissed = false]
    CheckDue --> HasDue{Due Reminders Found?}
    HasDue -->|No| End[End - No Action]
    HasDue -->|Yes| LoopReminders[For Each Due Reminder]
    
    LoopReminders --> CreateNotification[INSERT INTO notifications<br/>type='reminder']
    CreateNotification --> MarkRead[UPDATE reminders<br/>SET is_read = true]
    MarkRead --> NextReminder{More Reminders?}
    NextReminder -->|Yes| LoopReminders
    NextReminder -->|No| End
    
    style Start fill:#e1f5ff
    style CreateNotification fill:#fff9c4
    style End fill:#c8e6c9
```

---

## 4. Timesheet Submission Flow

```mermaid
flowchart TD
    Start([User Submits Timesheet]) --> ValidateTimesheet{Timesheet Valid?}
    ValidateTimesheet -->|No| ShowError[Show Error Message]
    ShowError --> End
    ValidateTimesheet -->|Yes| CheckOwnership{User Owns<br/>Timesheet?}
    CheckOwnership -->|No| ShowForbidden[403 Forbidden]
    ShowForbidden --> End
    CheckOwnership -->|Yes| CheckStatus{Status = 'draft'?}
    CheckStatus -->|No| ShowAlreadySubmitted[Error: Already Submitted]
    ShowAlreadySubmitted --> End
    CheckStatus -->|Yes| LoadEntries[Load Timesheet Entries]
    LoadEntries --> ValidateEntries{Has Entries<br/>& Total Hours > 0?}
    ValidateEntries -->|No| ShowEmptyError[Error: Empty Timesheet]
    ShowEmptyError --> End
    ValidateEntries -->|Yes| BuildApprovals[Build Approval Chain]
    BuildApprovals --> CreateSnapshot[Create Audit Snapshot]
    CreateSnapshot --> CheckColumns{Check Column Existence:<br/>submitted_by, approvals,<br/>audit_snapshot}
    CheckColumns --> BuildUpdate[Build Dynamic UPDATE Query]
    BuildUpdate --> UpdateTimesheet[UPDATE timesheets SET:<br/>status = 'pending_approval'<br/>submitted_by = user_id<br/>approvals = JSONB array<br/>audit_snapshot = JSONB]
    UpdateTimesheet --> ReturnSuccess[Return Success Response]
    ReturnSuccess --> RefreshUI[Refresh Timesheet UI]
    
    style Start fill:#e1f5ff
    style ReturnSuccess fill:#c8e6c9
    style ShowError fill:#ffcdd2
    style ShowForbidden fill:#ffcdd2
    style ShowAlreadySubmitted fill:#ffcdd2
    style ShowEmptyError fill:#ffcdd2
```

---

## 5. Notification System Flow

### 5.1 Notification Display Flow

```mermaid
flowchart TD
    Start([Notifications Component Mounted]) --> FetchNotifications[GET /api/notifications]
    FetchNotifications --> FilterUnread[Filter: is_read = false]
    FilterUnread --> DisplayList[Display Notification List]
    DisplayList --> UserAction{User Action?}
    
    UserAction -->|Mark as Read| MarkReadAPI[POST /api/notifications/:id/read]
    MarkReadAPI --> UpdateBackend[UPDATE notifications<br/>SET is_read = true]
    UpdateBackend --> RemoveFromUI[Remove from UI Immediately]
    RemoveFromUI --> RefreshList[Refresh List]
    
    UserAction -->|Clear All| ClearAllAPI[POST /api/notifications/clear-all]
    ClearAllAPI --> MarkAllRead[UPDATE notifications<br/>SET is_read = true<br/>WHERE user_id = X]
    MarkAllRead --> ClearUI[Clear UI List]
    ClearUI --> RefreshList
    
    UserAction -->|Dismiss| DismissAPI[POST /api/notifications/:id/dismiss]
    DismissAPI --> UpdateDismissed[UPDATE notifications<br/>SET is_dismissed = true]
    UpdateDismissed --> RemoveFromUI
    
    RefreshList --> FetchNotifications
    
    style Start fill:#e1f5ff
    style RemoveFromUI fill:#c8e6c9
    style ClearUI fill:#c8e6c9
```

### 5.2 Notification Creation Flow

```mermaid
flowchart TD
    Start([System Event Triggers Notification]) --> DetermineType{Notification Type?}
    DetermineType -->|Reminder| FromCron[From Reminder Cron Job]
    DetermineType -->|Timesheet| FromTimesheet[From Timesheet Approval]
    DetermineType -->|Other| FromOther[From Other System Events]
    
    FromCron --> CreateReminderNotif[INSERT INTO notifications<br/>type='reminder']
    FromTimesheet --> CreateTimesheetNotif[INSERT INTO notifications<br/>type='timesheet']
    FromOther --> CreateOtherNotif[INSERT INTO notifications<br/>type='other']
    
    CreateReminderNotif --> SetUnread[Set is_read = false]
    CreateTimesheetNotif --> SetUnread
    CreateOtherNotif --> SetUnread
    
    SetUnread --> NotificationCreated[Notification Created]
    NotificationCreated --> FrontendPoll[Frontend Polls/Refreshes]
    FrontendPoll --> DisplayNotification[Display in UI]
    
    style Start fill:#e1f5ff
    style NotificationCreated fill:#c8e6c9
    style DisplayNotification fill:#c8e6c9
```

---

## 6. Complete System Architecture Flow

```mermaid
flowchart TB
    subgraph Frontend["Frontend (React + TypeScript)"]
        Login[Login Page]
        Dashboard[Dashboard]
        SmartMemo[Smart Memo Component]
        ReminderCountdown[Reminder Countdown]
        Notifications[Notifications Component]
        Timesheets[Timesheets Page]
    end
    
    subgraph Backend["Backend (Express + Node.js)"]
        AuthRoutes[Auth Routes]
        SmartMemoRoutes[Smart Memo Routes]
        ReminderRoutes[Reminder Routes]
        NotificationRoutes[Notification Routes]
        TimesheetRoutes[Timesheet Routes]
    end
    
    subgraph Database["PostgreSQL Database"]
        Profiles[profiles]
        Employees[employees]
        TeamScheduleEvents[team_schedule_events]
        Reminders[reminders]
        Notifications[notifications]
        Timesheets[timesheets]
    end
    
    subgraph Services["Background Services"]
        ReminderCron[Reminder Cron Job<br/>Runs Every Minute]
    end
    
    Login -->|POST /api/auth/check-email| AuthRoutes
    Login -->|POST /api/auth/login| AuthRoutes
    Login -->|POST /api/auth/first-time-setup| AuthRoutes
    AuthRoutes --> Profiles
    
    Dashboard --> SmartMemo
    SmartMemo -->|POST /api/calendar/smart-memo| SmartMemoRoutes
    SmartMemoRoutes --> TeamScheduleEvents
    SmartMemoRoutes --> Reminders
    
    Dashboard --> ReminderCountdown
    ReminderCountdown -->|GET /api/reminders/active| ReminderRoutes
    ReminderCountdown -->|POST /api/reminders/:id/cancel| ReminderRoutes
    ReminderRoutes --> Reminders
    
    Dashboard --> Notifications
    Notifications -->|GET /api/notifications| NotificationRoutes
    Notifications -->|POST /api/notifications/:id/read| NotificationRoutes
    NotificationRoutes --> Notifications
    
    Timesheets -->|POST /api/timesheets/:id/submit| TimesheetRoutes
    TimesheetRoutes --> Timesheets
    TimesheetRoutes --> Employees
    
    ReminderCron -->|Check Due Reminders| Reminders
    ReminderCron -->|Create Notifications| Notifications
    
    style Frontend fill:#e3f2fd
    style Backend fill:#f3e5f5
    style Database fill:#e8f5e9
    style Services fill:#fff3e0
```

---

## Notes

- **RLS (Row Level Security)**: All queries to `team_schedule_events` respect tenant isolation through RLS policies
- **Dynamic Column Handling**: Timesheet submission dynamically checks for column existence before using them
- **Real-time Updates**: Reminder countdown uses custom events and polling for instant UI updates
- **Error Handling**: All flows include comprehensive error handling and user feedback
- **Security**: All API endpoints require authentication tokens and tenant context validation





