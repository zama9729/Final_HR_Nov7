# HR-Payroll System Manual
## Complete System Architecture & Data Flow Documentation

This document provides a comprehensive guide to how the HR-Payroll integrated system works, including detailed flowcharts showing data flow and system operations.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Authentication Flow](#authentication-flow)
4. [SSO Integration Flow](#sso-integration-flow)
5. [Data Flow Architecture](#data-flow-architecture)
6. [Employee Lifecycle](#employee-lifecycle)
7. [Payroll Processing Flow](#payroll-processing-flow)
8. [Database Schema & Views](#database-schema--views)
9. [API Request Flow](#api-request-flow)
10. [Error Handling & Recovery](#error-handling--recovery)

---

## System Overview

The HR-Payroll Suite is a unified system consisting of:
- **HR System**: Employee management, onboarding, leave management, timesheets
- **Payroll System**: Payroll processing, payslips, tax calculations, compensation
- **Shared Database**: PostgreSQL database used by both systems
- **SSO Integration**: Seamless single sign-on between HR and Payroll systems

### Key Components

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
├─────────────────────────────────────────────────────────────┤
│  HR Frontend (React)      │  Payroll Frontend (React)      │
│  http://localhost:3000    │  http://localhost:3002         │
└──────────────┬────────────────────────┬─────────────────────┘
               │                        │
               │                        │
┌──────────────▼────────────────────────▼─────────────────────┐
│                     API LAYER                               │
├─────────────────────────────────────────────────────────────┤
│  HR API (Express)          │  Payroll API (Express)        │
│  http://localhost:3001     │  http://localhost:4000        │
│  - Auth routes             │  - SSO routes                 │
│  - Employee routes         │  - Payroll routes             │
│  - Leave routes            │  - Compensation routes        │
└──────────────┬────────────────────────┬─────────────────────┘
               │                        │
               │                        │
┌──────────────▼────────────────────────▼─────────────────────┐
│                  DATABASE LAYER                             │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL (hr_suite)     │  Redis (Cache)                │
│  - Organizations           │  - Session cache              │
│  - Profiles                │  - Query cache                │
│  - Employees               │  - Rate limiting              │
│  - Payroll views           │                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Diagram

```mermaid
flowchart TB
    subgraph "Frontend Layer"
        HR_UI[HR Frontend<br/>React App<br/>:3000]
        PAYROLL_UI[Payroll Frontend<br/>React App<br/>:3002]
    end
    
    subgraph "API Layer"
        HR_API[HR API Server<br/>Express.js<br/>:3001]
        PAYROLL_API[Payroll API Server<br/>Express.js<br/>:4000]
    end
    
    subgraph "Authentication"
        JWT_AUTH[JWT Authentication]
        SSO_MIDDLEWARE[SSO Middleware<br/>RSA Verification]
    end
    
    subgraph "Database Layer"
        POSTGRES[(PostgreSQL<br/>hr_suite<br/>:5432)]
        REDIS[(Redis Cache<br/>:6379)]
    end
    
    subgraph "Views & Services"
        EMP_VIEW[payroll_employee_view]
        ORG_VIEW[payroll_organization_view]
        USER_SVC[User Service<br/>Auto-provisioning]
    end
    
    HR_UI -->|HTTP Requests| HR_API
    PAYROLL_UI -->|HTTP Requests| PAYROLL_API
    HR_API -->|Generate JWT| JWT_AUTH
    PAYROLL_API -->|Verify JWT| SSO_MIDDLEWARE
    HR_API -->|Query| POSTGRES
    PAYROLL_API -->|Query| POSTGRES
    HR_API -->|Cache| REDIS
    PAYROLL_API -->|Cache| REDIS
    POSTGRES -->|Provides| EMP_VIEW
    POSTGRES -->|Provides| ORG_VIEW
    PAYROLL_API -->|Uses| USER_SVC
    USER_SVC -->|Query| POSTGRES
    
    HR_API -.->|SSO Token| PAYROLL_API
    
    style HR_UI fill:#e1f5ff
    style PAYROLL_UI fill:#ffe1f5
    style HR_API fill:#4CAF50
    style PAYROLL_API fill:#FF9800
    style POSTGRES fill:#336791
    style REDIS fill:#DC382D
```

---

## Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant HR_Frontend
    participant HR_API
    participant DB as PostgreSQL
    participant HR_Backend
    
    User->>HR_Frontend: 1. Enter credentials
    HR_Frontend->>HR_API: 2. POST /api/auth/login
    HR_API->>DB: 3. Query profiles & user_auth
    DB-->>HR_API: 4. Return user data
    HR_API->>HR_Backend: 5. Verify password hash
    HR_Backend-->>HR_API: 6. Password valid
    HR_API->>HR_Backend: 7. Generate JWT token
    HR_Backend-->>HR_API: 8. Return JWT token
    HR_API-->>HR_Frontend: 9. Return JWT token
    HR_Frontend->>HR_Frontend: 10. Store token in localStorage
    HR_Frontend->>HR_API: 11. GET /api/profiles/me (with token)
    HR_API->>HR_Backend: 12. Verify JWT token
    HR_Backend-->>HR_API: 13. Token valid, user data
    HR_API->>DB: 14. Query user roles & profile
    DB-->>HR_API: 15. Return user roles
    HR_API-->>HR_Frontend: 16. Return user profile & roles
    HR_Frontend->>User: 17. Display dashboard
```

### Authentication Steps

1. **User Login**
   - User enters email and password
   - Frontend sends credentials to `/api/auth/login`
   - API verifies credentials against database
   - JWT token generated with user ID, roles, org ID

2. **Token Storage**
   - JWT token stored in `localStorage`
   - Token included in `Authorization: Bearer <token>` header
   - Token expires after 7 days (configurable)

3. **Protected Routes**
   - `authenticateToken` middleware verifies token
   - Extracts user data from token
   - Attaches user to `req.user` object

4. **Session Management**
   - Token validated on each API request
   - Invalid/expired tokens return 401 Unauthorized
   - User redirected to login page

---

## SSO Integration Flow

```mermaid
sequenceDiagram
    participant User
    participant HR_Frontend
    participant HR_API
    participant PAYROLL_API
    participant DB as PostgreSQL
    participant PAYROLL_Frontend
    
    User->>HR_Frontend: 1. Click "Payroll" link
    HR_Frontend->>HR_API: 2. GET /api/payroll/sso (with JWT)
    HR_API->>HR_API: 3. Verify user JWT token
    HR_API->>DB: 4. Query user profile & roles
    DB-->>HR_API: 5. Return user data
    HR_API->>HR_API: 6. Generate SSO JWT (RS256)
    Note over HR_API: Claims: sub, org_id, email,<br/>roles, payroll_role
    HR_API->>HR_API: 7. Sign with private key
    HR_API-->>HR_Frontend: 8. Return redirect URL
    HR_Frontend->>PAYROLL_API: 9. GET /sso?token=<SSO_JWT>
    PAYROLL_API->>PAYROLL_API: 10. Verify SSO JWT (public key)
    PAYROLL_API->>PAYROLL_API: 11. Extract user claims
    PAYROLL_API->>DB: 12. Check if user exists
    alt User does not exist
        PAYROLL_API->>PAYROLL_API: 13. Auto-provision user
        PAYROLL_API->>DB: 14. Create user record
        PAYROLL_API->>DB: 15. Create employee record
    else User exists
        PAYROLL_API->>DB: 16. Update user profile
    end
    PAYROLL_API->>DB: 17. Check PIN setup status
    alt PIN not set
        PAYROLL_API-->>PAYROLL_Frontend: 18. Redirect to /setup-pin
        PAYROLL_Frontend->>User: 19. Show PIN setup form
    else PIN set
        PAYROLL_API->>PAYROLL_API: 20. Create session cookie
        PAYROLL_API-->>PAYROLL_Frontend: 21. Redirect to /pin-auth
        PAYROLL_Frontend->>User: 22. Show PIN entry form
    end
    User->>PAYROLL_Frontend: 23. Enter PIN
    PAYROLL_Frontend->>PAYROLL_API: 24. POST /sso/verify-pin
    PAYROLL_API->>DB: 25. Verify PIN hash
    PAYROLL_API->>PAYROLL_API: 26. Set pin_ok cookie
    PAYROLL_API-->>PAYROLL_Frontend: 27. Return dashboard URL
    PAYROLL_Frontend->>User: 28. Show dashboard
```

### SSO Flow Details

#### Step 1-8: Token Generation (HR Side)
- User authenticated in HR system clicks "Payroll" link
- HR API generates SSO JWT with user claims:
  - `sub`: HR user ID
  - `org_id`: Organization ID
  - `email`: User email
  - `roles`: Array of HR roles
  - `payroll_role`: Mapped role (payroll_admin or payroll_employee)
- Token signed with RSA private key (RS256 algorithm)
- Token expires in 5 minutes

#### Step 9-11: Token Verification (Payroll Side)
- Payroll API receives SSO token in query parameter
- Verifies token signature using RSA public key
- Validates token claims (issuer, audience, expiry)
- Extracts user information from token

#### Step 12-16: User Provisioning
- Payroll checks if user exists by email or `hr_user_id`
- If not exists: Auto-creates user and employee records
- If exists: Updates user profile with latest HR data
- Ensures employee record exists for all users

#### Step 17-22: PIN Management
- Checks if user has PIN set (required for security)
- First-time users redirected to PIN setup
- Existing users redirected to PIN verification
- Session cookie set after PIN setup/verification

#### Step 23-28: PIN Verification
- User enters 6-digit PIN
- PIN hashed and compared with stored hash
- On success: `pin_ok` cookie set (12-hour expiry)
- User redirected to appropriate dashboard based on role

---

## Data Flow Architecture

```mermaid
flowchart LR
    subgraph "HR System Data Flow"
        A[HR Frontend] -->|1. Request| B[HR API]
        B -->|2. Query| C[PostgreSQL]
        C -->|3. Data| D[payroll_employee_view]
        D -->|4. Joined Data| C
        C -->|5. Results| B
        B -->|6. Response| A
    end
    
    subgraph "Payroll System Data Flow"
        E[Payroll Frontend] -->|1. Request| F[Payroll API]
        F -->|2. Query| C
        C -->|3. View Data| D
        D -->|4. Employee + Profile| C
        C -->|5. Results| F
        F -->|6. Response| E
    end
    
    subgraph "Unified Database"
        C
        D
        G[employees table]
        H[profiles table]
        I[organizations table]
        J[compensation_structures]
        
        D -.->|Reads from| G
        D -.->|Reads from| H
        D -.->|Reads from| I
    end
    
    subgraph "Write Operations"
        B -->|Writes| G
        B -->|Writes| H
        F -->|Writes| J
    end
    
    style D fill:#FFE082
    style C fill:#81C784
    style B fill:#64B5F6
    style F fill:#FFB74D
```

### Data Flow Details

#### Read Operations

1. **HR System Reads**
   - HR API queries `employees`, `profiles`, `organizations` tables directly
   - Uses standard SQL queries with tenant isolation
   - Results filtered by `tenant_id` (multi-tenant support)

2. **Payroll System Reads**
   - Payroll API primarily uses `payroll_employee_view`
   - View joins HR tables: `employees`, `profiles`, `onboarding_data`
   - Provides unified employee data structure
   - Column mapping: `join_date` → `date_of_joining`, `position` → `designation`

#### Write Operations

1. **HR System Writes**
   - Creates/updates employees in `employees` table
   - Creates/updates profiles in `profiles` table
   - Updates organizations in `organizations` table
   - Changes immediately visible to Payroll via view

2. **Payroll System Writes**
   - Creates/updates compensation structures
   - Creates payroll cycles and payslips
   - Updates employee payroll-specific data
   - Does not modify HR core employee data

#### View Benefits

- **Real-time Sync**: Changes in HR immediately visible to Payroll
- **Data Consistency**: Single source of truth
- **Column Mapping**: Handles schema differences automatically
- **Tenant Isolation**: Views respect tenant boundaries

---

## Employee Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Signup: CEO/Admin creates account
    Signup --> Organization_Created: Organization created
    Organization_Created --> Employee_Creation: HR creates employee
    Employee_Creation --> Onboarding_Pending: Employee record created
    Onboarding_Pending --> Email_Verification: Email sent
    Email_Verification --> Password_Setup: Email verified
    Password_Setup --> First_Login: Password set
    First_Login --> Active: Login successful
    
    Active --> Leave_Management: Request leave
    Active --> Timesheet: Submit timesheet
    Active --> Payroll_SSO: Access Payroll
    Payroll_SSO --> PIN_Setup: First time
    PIN_Setup --> Payroll_Active: PIN set
    Payroll_SSO --> PIN_Verify: Has PIN
    PIN_Verify --> Payroll_Active: PIN verified
    Payroll_Active --> Payslip_View: View payslip
    
    Active --> Role_Update: Role changed
    Role_Update --> Active: Updated
    
    Active --> Termination: Employee terminated
    Termination --> [*]
    
    note right of Payroll_SSO
        Auto-provisioning
        happens here
    end note
```

### Employee Lifecycle Stages

1. **Signup & Organization Creation**
   - CEO/Admin signs up and creates organization
   - Organization record created in `organizations` table
   - CEO assigned `admin` role

2. **Employee Creation**
   - HR creates employee record
   - Employee ID generated
   - Profile record created
   - Temporary password set

3. **Onboarding**
   - Employee receives verification email
   - Email verified via token
   - Password setup required
   - Onboarding data collected

4. **Active Employee**
   - Employee can login
   - Access to HR features based on role
   - Can request leave, submit timesheets
   - Can access Payroll via SSO

5. **Payroll Integration**
   - First Payroll access triggers auto-provisioning
   - PIN setup required
   - Employee record created in Payroll if missing
   - Access to payroll features based on role

6. **Role Updates**
   - Roles can be updated in HR system
   - Changes reflected in Payroll via SSO
   - Payroll role automatically mapped

7. **Termination**
   - Employee status set to 'terminated'
   - Access revoked
   - Historical data preserved

---

## Payroll Processing Flow

```mermaid
flowchart TD
    A[HR Admin/CEO] -->|1. Create Payroll Cycle| B[Payroll API]
    B -->|2. Validate Cycle| C{Valid?}
    C -->|No| D[Return Error]
    C -->|Yes| E[Create Cycle Record]
    E -->|3. Query Employees| F[payroll_employee_view]
    F -->|4. Get Active Employees| G[PostgreSQL]
    G -->|5. Employee List| B
    B -->|6. Calculate Compensation| H[Compensation Service]
    H -->|7. Query Structures| I[compensation_structures]
    I -->|8. CTC Data| H
    H -->|9. Calculate Components| B
    B -->|10. Create Payslips| J[Payslip Generation]
    J -->|11. Calculate Taxes| K[Tax Calculator]
    K -->|12. Tax Rules| G
    K -->|13. Tax Amounts| J
    J -->|14. Generate Payslips| B
    B -->|15. Store Payslips| G
    B -->|16. Status: Pending Approval| L[Approval Workflow]
    L -->|17. Manager Review| M[Manager Dashboard]
    M -->|18. Approve/Reject| L
    L -->|19. Approved| B
    B -->|20. Finalize Cycle| N[Cycle Finalized]
    N -->|21. Generate PDFs| O[PDF Generator]
    O -->|22. Store PDFs| G
    N -->|23. Send Notifications| P[Notification Service]
    P -->|24. Email Payslips| Q[Employees]
    
    style B fill:#FF9800
    style F fill:#FFE082
    style G fill:#81C784
    style H fill:#64B5F6
    style K fill:#F06292
```

### Payroll Processing Steps

1. **Cycle Creation**
   - Admin creates payroll cycle for a month
   - Cycle includes: period start/end, organization, status
   - Validation: No overlapping cycles, valid dates

2. **Employee Retrieval**
   - Query `payroll_employee_view` for active employees
   - Filter by organization and employment status
   - Include employees who joined before cycle end

3. **Compensation Calculation**
   - For each employee, get latest compensation structure
   - Calculate monthly salary from CTC (CTC / 12)
   - Calculate components: basic, HRA, allowances, deductions

4. **Tax Calculation**
   - Calculate income tax based on tax slabs
   - Calculate PF, ESI deductions
   - Calculate TDS based on annual projection
   - Apply exemptions and deductions

5. **Payslip Generation**
   - Create payslip record for each employee
   - Store calculated amounts
   - Status: Pending Approval

6. **Approval Workflow**
   - Manager reviews payslips
   - Can approve or reject individual payslips
   - Rejected payslips sent back for correction

7. **Finalization**
   - After approval, cycle marked as finalized
   - Payslips locked (no further edits)
   - PDF generation triggered

8. **PDF Generation & Distribution**
   - Generate PDF for each payslip
   - Store PDF in database or file system
   - Send email notifications to employees
   - Employees can download payslips

---

## Database Schema & Views

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ PROFILES : has
    ORGANIZATIONS ||--o{ EMPLOYEES : has
    PROFILES ||--o| EMPLOYEES : "linked to"
    PROFILES ||--o{ USER_ROLES : has
    EMPLOYEES ||--o{ COMPENSATION_STRUCTURES : has
    EMPLOYEES ||--o{ PAYROLL_ITEMS : has
    PAYROLL_CYCLES ||--o{ PAYROLL_ITEMS : contains
    ORGANIZATIONS ||--o{ PAYROLL_CYCLES : has
    
    ORGANIZATIONS {
        uuid id PK
        string name
        string domain
        string timezone
    }
    
    PROFILES {
        uuid id PK
        string email UK
        string first_name
        string last_name
        uuid tenant_id FK
    }
    
    EMPLOYEES {
        uuid id PK
        uuid user_id FK
        string employee_id UK
        date join_date
        string status
        uuid tenant_id FK
    }
    
    USER_ROLES {
        uuid id PK
        uuid user_id FK
        string role
        uuid tenant_id FK
    }
    
    COMPENSATION_STRUCTURES {
        uuid id PK
        uuid employee_id FK
        decimal ctc
        decimal basic_salary
        date effective_from
    }
    
    PAYROLL_CYCLES {
        uuid id PK
        uuid org_id FK
        date period_start
        date period_end
        string status
    }
    
    PAYROLL_ITEMS {
        uuid id PK
        uuid cycle_id FK
        uuid employee_id FK
        decimal gross_salary
        decimal net_salary
        decimal tax_amount
    }
```

### Key Views

#### `payroll_employee_view`
Unified view combining HR employee data:

```sql
CREATE OR REPLACE VIEW payroll_employee_view AS
SELECT 
    e.id as employee_id,
    e.tenant_id as org_id,
    e.employee_id as employee_code,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) as full_name,
    p.email,
    e.join_date as date_of_joining,
    e.department,
    e.position as designation,
    e.status as employment_status,
    e.user_id as hr_user_id
FROM employees e
LEFT JOIN profiles p ON p.id = e.user_id
WHERE e.status != 'terminated' OR e.status IS NULL;
```

**Purpose**: Provides Payroll system with unified employee data structure

**Column Mapping**:
- `join_date` → `date_of_joining`
- `position` → `designation`
- `status` → `employment_status`

#### `payroll_organization_view`
Organization data for Payroll:

```sql
CREATE OR REPLACE VIEW payroll_organization_view AS
SELECT 
    id as org_id,
    name as company_name,
    domain,
    timezone
FROM organizations;
```

---

## API Request Flow

```mermaid
sequenceDiagram
    participant Client
    participant Frontend
    participant API
    participant Middleware
    participant Service
    participant DB as Database
    participant Cache as Redis
    
    Client->>Frontend: 1. User Action
    Frontend->>API: 2. HTTP Request (with JWT)
    API->>Middleware: 3. authenticateToken
    Middleware->>Middleware: 4. Verify JWT
    alt Token Invalid
        Middleware-->>Frontend: 5a. 401 Unauthorized
        Frontend-->>Client: 6a. Redirect to Login
    else Token Valid
        Middleware->>API: 5b. Attach user to req
        API->>Cache: 6. Check cache
        alt Cache Hit
            Cache-->>API: 7a. Return cached data
            API-->>Frontend: 8a. Return response
        else Cache Miss
            API->>Service: 7b. Call service
            Service->>DB: 8. Query database
            DB-->>Service: 9. Return data
            Service->>Cache: 10. Store in cache
            Service-->>API: 11. Return data
            API-->>Frontend: 12. Return response
        end
        Frontend->>Frontend: 13. Update UI
        Frontend-->>Client: 14. Show result
    end
```

### Request Flow Details

1. **Client Action**
   - User interacts with frontend (click, form submit, etc.)
   - Frontend captures action and prepares API request

2. **API Request**
   - Frontend sends HTTP request to API endpoint
   - Includes JWT token in `Authorization` header
   - Includes request body (for POST/PUT) or query params (for GET)

3. **Middleware Processing**
   - `authenticateToken` middleware intercepts request
   - Verifies JWT token signature and expiry
   - Extracts user data from token
   - Attaches user to `req.user` object

4. **Cache Check**
   - API checks Redis cache for cached response
   - Cache key based on endpoint, user, and parameters
   - If cache hit, return cached data immediately

5. **Service Layer**
   - API calls appropriate service function
   - Service contains business logic
   - Service queries database through connection pool

6. **Database Query**
   - Service executes SQL query
   - Database returns results
   - Results processed and formatted

7. **Response**
   - Service returns processed data to API
   - API caches response (if cacheable)
   - API returns JSON response to frontend

8. **Frontend Update**
   - Frontend receives response
   - Updates UI state
   - Renders updated data to user

---

## Error Handling & Recovery

```mermaid
flowchart TD
    A[API Request] -->|Error Occurs| B{Error Type?}
    
    B -->|400 Bad Request| C[Validation Error]
    B -->|401 Unauthorized| D[Auth Error]
    B -->|404 Not Found| E[Resource Not Found]
    B -->|500 Server Error| F[Internal Error]
    B -->|Database Error| G[DB Connection Error]
    
    C -->|Return| H[400: Invalid Input]
    D -->|Return| I[401: Unauthorized]
    E -->|Return| J[404: Not Found]
    
    F -->|Log| K[Error Logger]
    F -->|Return| L[500: Server Error]
    
    G -->|Retry| M{Retry Count < 3?}
    M -->|Yes| N[Retry Query]
    M -->|No| O[Return DB Error]
    N -->|Success| P[Return Data]
    N -->|Fail| M
    
    K -->|Store| Q[Error Logs]
    K -->|Alert| R[Admin Notification]
    
    H --> S[Frontend]
    I --> S
    J --> S
    L --> S
    O --> S
    P --> S
    
    S -->|Display| T[User sees error message]
    
    style C fill:#FFE082
    style D fill:#EF5350
    style E fill:#FF9800
    style F fill:#F44336
    style G fill:#9C27B0
```

### Error Handling Strategy

1. **Validation Errors (400)**
   - Input validation fails
   - Return specific error message
   - Frontend displays validation errors

2. **Authentication Errors (401)**
   - Invalid or expired token
   - Redirect to login page
   - Clear stored tokens

3. **Not Found Errors (404)**
   - Resource doesn't exist
   - Return friendly error message
   - Frontend shows "Not Found" page

4. **Server Errors (500)**
   - Unexpected errors
   - Log error details
   - Return generic error message
   - Alert administrators

5. **Database Errors**
   - Connection failures
   - Query errors
   - Retry with exponential backoff
   - Fallback to cached data if available

### Recovery Mechanisms

- **Automatic Retries**: Database queries retry up to 3 times
- **Circuit Breaker**: Prevents cascade failures
- **Cache Fallback**: Return cached data if database unavailable
- **Graceful Degradation**: System continues with limited functionality

---

## Security Flow

```mermaid
flowchart TD
    A[User Request] -->|1. Includes JWT| B[API Gateway]
    B -->|2. Extract Token| C{Token Present?}
    C -->|No| D[401 Unauthorized]
    C -->|Yes| E[Verify JWT Signature]
    E -->|Invalid| D
    E -->|Valid| F[Check Expiry]
    F -->|Expired| D
    F -->|Valid| G[Extract Claims]
    G -->|3. Check Roles| H{Role Allowed?}
    H -->|No| I[403 Forbidden]
    H -->|Yes| J[Set Tenant Context]
    J -->|4. Query with tenant_id| K[Database]
    K -->|5. Return Data| L[Response]
    L -->|6. Filter by tenant| M[Return to User]
    
    style E fill:#FFE082
    style F fill:#FFE082
    style H fill:#FFE082
    style J fill:#81C784
```

### Security Layers

1. **JWT Authentication**
   - All API requests require valid JWT
   - Token includes user ID, roles, organization ID
   - Tokens signed with secret key

2. **Role-Based Access Control (RBAC)**
   - Each endpoint checks user roles
   - Roles: `admin`, `hr`, `ceo`, `manager`, `employee`
   - Payroll roles: `payroll_admin`, `payroll_employee`

3. **Tenant Isolation**
   - All queries filtered by `tenant_id`
   - Users can only access their organization's data
   - Prevents cross-tenant data access

4. **SSO Security**
   - RSA-256 algorithm for JWT signing
   - Private key stored securely in HR system
   - Public key in Payroll system
   - Token expires in 5 minutes

---

## System Integration Points

```mermaid
flowchart LR
    subgraph "HR System"
        A[HR Frontend]
        B[HR API]
        C[HR Database Operations]
    end
    
    subgraph "Integration Layer"
        D[SSO Token Generator]
        E[JWT Signer RS256]
        F[User Provisioning]
    end
    
    subgraph "Payroll System"
        G[Payroll Frontend]
        H[Payroll API]
        I[Payroll Database Operations]
    end
    
    subgraph "Shared Database"
        J[(PostgreSQL)]
        K[payroll_employee_view]
    end
    
    A -->|User Action| B
    B -->|Generate Token| D
    D -->|Sign| E
    E -->|Redirect| G
    G -->|Verify Token| H
    H -->|Auto-provision| F
    F -->|Create User| J
    B -->|Write| J
    H -->|Read| K
    K -->|Read| J
    I -->|Write| J
    
    style D fill:#FFE082
    style E fill:#FFE082
    style F fill:#81C784
    style K fill:#64B5F6
```

---

## Deployment Architecture

```mermaid
flowchart TB
    subgraph "Development Environment"
        A[Docker Compose]
        B[HR Frontend :3000]
        C[HR API :3001]
        D[Payroll Frontend :3002]
        E[Payroll API :4000]
        F[PostgreSQL :5432]
        G[Redis :6379]
    end
    
    A --> B
    A --> C
    A --> D
    A --> E
    A --> F
    A --> G
    
    B --> C
    D --> E
    C --> F
    E --> F
    C --> G
    E --> G
    
    style A fill:#2196F3
    style F fill:#336791
    style G fill:#DC382D
```

### Services

- **HR Frontend**: React app on port 3000
- **HR API**: Express server on port 3001
- **Payroll Frontend**: React app on port 3002
- **Payroll API**: Express server on port 4000
- **PostgreSQL**: Database on port 5432
- **Redis**: Cache on port 6379

---

## Data Synchronization

```mermaid
flowchart TD
    A[HR System] -->|1. Create Employee| B[employees table]
    B -->|2. Insert Record| C[PostgreSQL]
    C -->|3. View Updated| D[payroll_employee_view]
    D -->|4. Real-time| E[Payroll System]
    E -->|5. Query View| D
    D -->|6. Return Data| E
    
    F[HR System] -->|1. Update Employee| B
    B -->|2. Update Record| C
    C -->|3. View Updated| D
    D -->|4. Real-time| E
    
    G[Payroll System] -->|1. Create Compensation| H[compensation_structures]
    H -->|2. Insert Record| C
    C -->|3. Available to| I[Payroll Queries]
    
    style D fill:#FFE082
    style C fill:#81C784
```

### Synchronization Methods

1. **Real-time via Views**
   - Changes in HR immediately visible to Payroll
   - No manual sync needed
   - Views provide unified data structure

2. **SSO-based User Sync**
   - User data synced on SSO login
   - Auto-provisioning creates missing records
   - Profile updates applied automatically

3. **Compensation Sync**
   - Payroll creates compensation structures
   - Linked to HR employee records
   - Used for payroll calculations

---

## Summary

This system provides:

✅ **Unified Database**: Single source of truth for HR and Payroll data  
✅ **Real-time Sync**: Views ensure data consistency  
✅ **Seamless SSO**: Single sign-on between HR and Payroll  
✅ **Auto-provisioning**: Automatic user creation in Payroll  
✅ **Role-based Access**: Secure access control  
✅ **Multi-tenant**: Support for multiple organizations  
✅ **Scalable**: Microservices architecture  
✅ **Cached**: Redis caching for performance  

---

## Quick Reference

### Key Endpoints

**HR API**:
- `POST /api/auth/login` - Login
- `GET /api/payroll/sso` - Generate SSO token
- `GET /api/employees` - List employees
- `POST /api/employees` - Create employee

**Payroll API**:
- `GET /sso?token=<jwt>` - SSO login
- `POST /sso/verify-pin` - Verify PIN
- `GET /api/payroll-cycles` - List cycles
- `POST /api/payroll-cycles` - Create cycle

### Environment Variables

```env
# HR System
HR_PAYROLL_JWT_PRIVATE_KEY="<private-key>"
PAYROLL_INTEGRATION_ENABLED=true
PAYROLL_BASE_URL=http://localhost:3002

# Payroll System
HR_PAYROLL_JWT_PUBLIC_KEY="<public-key>"
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/hr_suite
```

---

*Last Updated: 2025-01-07*
*Version: 1.0*

