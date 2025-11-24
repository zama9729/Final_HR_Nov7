# Multi-Branch Attendance v1 Implementation Status

## Overview
This document tracks the implementation of the multi-branch attendance system with geolocation, WFO/WFH tracking, analytics, and policy management.

**Feature Flag**: `MULTI_BRANCH_ATTENDANCE_V1` (backend) / `VITE_MULTI_BRANCH_ATTENDANCE_V1` (frontend)

---

## ✅ Phase 1: Clock In/Out with Geolocation (COMPLETED)

### Database Changes
- ✅ Migration file: `server/db/migrations/20250120_multi_branch_attendance_v1.sql`
- ✅ Added geolocation fields to `attendance_events`:
  - `lat`, `lon` (NUMERIC)
  - `address_text` (TEXT)
  - `capture_method` (ENUM: 'geo', 'manual', 'kiosk', 'unknown')
  - `consent` (BOOLEAN)
  - `consent_ts` (TIMESTAMPTZ)
  - `work_location_branch_id` (UUID)
  - `work_type` (ENUM: 'WFO', 'WFH')
- ✅ Added geolocation fields to `clock_punch_sessions`
- ✅ Created `branch_geofences` table with support for circle and polygon geofences
- ✅ Created geofence resolution functions:
  - `point_in_circle()` - Haversine distance calculation
  - `point_in_polygon()` - Ray casting algorithm
  - `resolve_branch_from_coords()` - Main resolution function

### Backend API
- ✅ New endpoint: `POST /api/attendance/clock`
  - Accepts: `action`, `ts`, `lat`, `lon`, `address_text`, `capture_method`, `consent`, `device_id`
  - Returns: `entry_id`, `work_type`, `resolved_branch_id`
  - Features:
    - Geocoding support (Google Maps API + Nominatim fallback)
    - Reverse geocoding
    - Branch resolution via geofences
    - WFO/WFH determination
    - Consent tracking
- ✅ Geocoding service: `server/services/geocoding.js`
  - Supports Google Maps Geocoding API
  - Falls back to OpenStreetMap Nominatim
  - Reverse geocoding support

### Frontend Components
- ✅ `AddressConsentModal` - Consent UI with geolocation prompt
  - Location: `src/components/attendance/AddressConsentModal.tsx`
  - Features:
    - Geolocation permission request
    - Manual address entry fallback
    - Consent tracking
    - Error handling
- ✅ `ClockResultToast` - Success/error feedback
  - Location: `src/components/attendance/ClockResultToast.tsx`
  - Shows: timestamp, work type, branch name, address
- ✅ `AttendanceEntryDetail` - Entry detail view
  - Location: `src/components/attendance/AttendanceEntryDetail.tsx`
  - Shows: location, capture method, consent status, map link
- ✅ Updated `ClockInOut` page to use new components
- ✅ Updated API client with new `clock()` method

### Configuration
- Set environment variable: `MULTI_BRANCH_ATTENDANCE_V1=true` (backend)
- Set environment variable: `VITE_MULTI_BRANCH_ATTENDANCE_V1=true` (frontend)
- Optional: `GOOGLE_MAPS_API_KEY` for enhanced geocoding

---

## 🚧 Phase 2: Attendance Analytics (PENDING)

### Required Endpoints
- [ ] `GET /api/analytics/attendance/overview`
- [ ] `GET /api/analytics/attendance/histogram`
- [ ] `GET /api/analytics/attendance/heatmap`
- [ ] `GET /api/analytics/attendance/map`
- [ ] `GET /api/analytics/attendance/distribution`

### Required Frontend
- [ ] Analytics page: `/analytics/attendance`
- [ ] KPI cards (Total employees, Present %, On-time %, WFO/WFH %, Pending approvals)
- [ ] Interactive timeline histogram
- [ ] Heatmap calendar
- [ ] Attendance distribution charts (violin/ridgeline)
- [ ] Geolocation map with clustered pins
- [ ] Policy compliance panel
- [ ] Export functionality (CSV, PDF)

---

## 🚧 Phase 3: Policy Management (PENDING)

### Database Changes Needed
- [ ] Create `policies` table
- [ ] Create `policy_versions` table
- [ ] Add policy templating support

### Backend APIs Needed
- [ ] `GET /api/policies` - List policies
- [ ] `POST /api/policies` - Create policy
- [ ] `GET /api/policies/:id` - Get policy
- [ ] `PATCH /api/policies/:id` - Update policy
- [ ] `DELETE /api/policies/:id` - Delete policy
- [ ] `POST /api/policies/:id/publish` - Publish policy
- [ ] `GET /api/policies/:id/download?version=:v` - PDF export
- [ ] `POST /api/policies/:id/version` - Create new version

### Frontend Components Needed
- [ ] Policy admin page: `/admin/policies`
- [ ] Policy editor (WYSIWYG + markdown)
- [ ] Template variable editor
- [ ] Policy preview
- [ ] Version history view
- [ ] PDF download button

### Seed Data Needed
- [ ] Default policy templates (25+ policies as specified)
- [ ] Editable parameters for each policy

---

## 🚧 Phase 4: Offboarding Workflow (PENDING)

### Required
- [ ] Offboarding policy template
- [ ] Automated offboarding process steps
- [ ] Step configuration UI
- [ ] Approver assignment
- [ ] Exit survey capture
- [ ] Final settlement tracking

---

## 🚧 Testing & Seed Data (PENDING)

### Required
- [ ] Unit tests for geofence functions
- [ ] Integration tests for clock API
- [ ] Seed data: 2 branches with geofences
- [ ] Seed data: 50 mock employees across teams
- [ ] Sample analytics data

---

## Usage Instructions

### 1. Run Database Migration
```sql
-- Run the migration file
\i server/db/migrations/20250120_multi_branch_attendance_v1.sql
```

### 2. Set Up Geofences
```sql
-- Example: Create a circle geofence for a branch
INSERT INTO branch_geofences (branch_id, type, coords, radius_meters, created_by)
VALUES (
  'branch-uuid',
  'circle',
  '{"center": {"lat": 12.9716, "lon": 77.5946}}'::jsonb,
  100, -- 100 meters radius
  'user-uuid'
);

-- Example: Create a polygon geofence
INSERT INTO branch_geofences (branch_id, type, coords, created_by)
VALUES (
  'branch-uuid',
  'polygon',
  '{"points": [{"lat": 12.9716, "lon": 77.5946}, {"lat": 12.9726, "lon": 77.5956}, ...]}'::jsonb,
  'user-uuid'
);
```

### 3. Enable Feature Flag
```bash
# Backend (.env)
MULTI_BRANCH_ATTENDANCE_V1=true
GOOGLE_MAPS_API_KEY=your_key_here  # Optional

# Frontend (.env)
VITE_MULTI_BRANCH_ATTENDANCE_V1=true
```

### 4. Test Clock In/Out
1. Navigate to Clock In/Out page
2. Click "Clock In" or "Clock Out"
3. Allow location access or enter address manually
4. Confirm the action
5. View result toast with WFO/WFH status

---

## Next Steps

1. **Complete Phase 2** - Implement analytics endpoints and frontend
2. **Complete Phase 3** - Build policy management system
3. **Complete Phase 4** - Enhance offboarding workflow
4. **Add Tests** - Unit and integration tests
5. **Add Seed Data** - Demo data for testing
6. **Performance Optimization** - Caching for analytics queries
7. **Documentation** - User guides and API documentation

---

## Notes

- The system does NOT rely on device fingerprinting for presence detection
- Address retention policy: Configurable (default 2 years)
- All changes are auditable via `attendance_audit_logs`
- Geofence resolution uses Haversine formula (no PostGIS required, but supported if available)
- Geocoding falls back gracefully if APIs are unavailable


