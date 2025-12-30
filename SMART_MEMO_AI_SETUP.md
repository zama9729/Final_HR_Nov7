# Smart Memo AI - Setup & Testing Guide

## ✅ Implementation Complete

The AI-powered Smart Memo feature has been fully implemented with all requested capabilities.

## Quick Start

### 1. Environment Setup

Add to your `.env` file:
```env
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini
```

### 2. Restart Services

```bash
docker-compose restart api
docker-compose build app
docker-compose restart app
```

### 3. Test the Feature

1. **Open Smart Memo**: Press `Cmd/Ctrl+K` or click the sparkles icon (✨) in the top bar
2. **Type naturally**: Try these examples:
   - "catch up with John next week about appraisal"
   - "remind me tomorrow morning to review payroll"
   - "meeting with team at 2pm on Monday"
   - "standup every weekday at 10am"

## Features Implemented

### ✅ Core Requirements Met

1. **AI-Based Intent Inference** ✅
   - Uses OpenAI GPT-4o-mini (not keyword matching)
   - Supports incomplete/vague language
   - Multiple intents from single input

2. **Entity & Time Inference** ✅
   - Extracts people, dates, times, recurrence
   - Smart defaults (morning = 10am, afternoon = 2pm)
   - User can edit all inferred values

3. **Context-Aware Intelligence** ✅
   - Uses current page (Employee Profile, Project, etc.)
   - Links actions to current entity
   - Role-based defaults (Manager → direct reports)

4. **Draft-First Save Model** ✅
   - Never auto-saves
   - Shows preview with confidence score
   - User edits before confirming

5. **User Confirmation UX** ✅
   - Preview dialog: "I'll create 1 meeting and 1 reminder"
   - Inline editing (time, participants, title)
   - "Save as note only" option
   - Explicit confirmation required

6. **Unified Output Targets** ✅
   - Calendar events → `team_schedule_events` table
   - Reminders → `reminders` table
   - Notes → `smart_memo_notes` table

7. **Error & Ambiguity Handling** ✅
   - Low confidence (< 0.6) → prompts clarification
   - Never blocks user
   - Fallback to regex parsing if AI unavailable

8. **Audit & Safety** ✅
   - All actions logged to `audit_logs` table
   - No auto-send calendar invites
   - Respects RBAC permissions

9. **UX Placements** ✅
   - Global top-bar input (Cmd/Ctrl+K) ✅
   - Dashboard widget (can replace existing SmartMemo) ✅
   - Contextual inputs on Employee/Project pages ✅

## File Structure

### Backend
- `server/services/smartMemoAI.js` - AI inference service
- `server/routes/smart-memo.js` - API endpoints (ai-infer, ai-execute)

### Frontend
- `src/components/smartmemo/SmartMemoAI.tsx` - Main component
- `src/components/smartmemo/SmartMemoCommandPalette.tsx` - Global command palette
- `src/lib/api.ts` - API client methods

### Integration Points
- `src/components/layout/AppLayout.tsx` - Global command palette
- `src/components/layout/TopNavBar.tsx` - Quick access button
- `src/pages/EmployeeDetail.tsx` - Contextual Smart Memo
- `src/pages/ProjectDetail.tsx` - Contextual Smart Memo

## API Endpoints

### POST /api/calendar/smart-memo/ai-infer
**Request:**
```json
{
  "memoText": "catch up with John next week about appraisal",
  "currentPage": "employees",
  "currentEntityId": "uuid",
  "currentEntityType": "employee",
  "currentEntityName": "John Doe"
}
```

**Response:**
```json
{
  "intents": ["calendar_event", "reminder"],
  "confidence": 0.9,
  "proposedActions": [
    {
      "type": "calendar_event",
      "title": "1:1 with John - Appraisal",
      "startDateTime": "2024-01-15T14:00:00Z",
      "duration": 30,
      "participants": ["employee-uuid"],
      "linkedEntity": "employee",
      "linkedEntityId": "employee-uuid"
    }
  ],
  "extractedEntities": {
    "people": ["John"],
    "dates": ["2024-01-15"],
    "times": ["14:00"]
  }
}
```

### POST /api/calendar/smart-memo/ai-execute
**Request:**
```json
{
  "confirmedActions": [
    {
      "type": "calendar_event",
      "title": "1:1 with John - Appraisal",
      "startDateTime": "2024-01-15T14:00:00Z",
      "duration": 30
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "results": {
    "calendarEvents": [...],
    "reminders": [...],
    "notes": [...]
  },
  "summary": {
    "calendarEvents": 1,
    "reminders": 0,
    "notes": 0
  }
}
```

## Testing Scenarios

### Test 1: Basic Calendar Event
**Input:** "meeting with Sarah tomorrow at 3pm"
**Expected:** Calendar event for tomorrow 3pm, linked to Sarah

### Test 2: Multiple Intents
**Input:** "catch up with John next week, remind me to prepare"
**Expected:** Calendar event + reminder

### Test 3: Vague Time
**Input:** "standup sometime next week"
**Expected:** Proposes default time (10am), user can edit

### Test 4: Context Awareness
**On Employee Profile Page:**
**Input:** "follow up next week"
**Expected:** Action linked to that employee automatically

### Test 5: Low Confidence
**Input:** "something about payroll maybe"
**Expected:** Shows low confidence warning, prompts clarification

### Test 6: Fallback (No OpenAI)
**Disable OpenAI API key:**
**Input:** "meeting at 2pm"
**Expected:** Falls back to regex parsing, still works

## Troubleshooting

### Issue: "OpenAI API key not configured"
**Solution:** Add `OPENAI_API_KEY` to `.env` and restart API container

### Issue: Low confidence on all inputs
**Solution:** Check OpenAI API key is valid and has credits

### Issue: People not resolving
**Solution:** Ensure employee names match database (case-insensitive)

### Issue: Dates not parsing correctly
**Solution:** System uses smart defaults - user can always edit in preview

## Next Steps

1. **Test thoroughly** with various natural language inputs
2. **Monitor OpenAI usage** to control costs
3. **Gather user feedback** on inference accuracy
4. **Fine-tune prompts** in `smartMemoAI.js` if needed
5. **Add more intent types** (task, email, etc.) as needed

## Success Metrics

- ✅ No rigid syntax required
- ✅ User can "type a thought" and system does the rest
- ✅ Fewer clicks than traditional HR workflows
- ✅ Clearly differentiates from competitors (AI-powered vs keyword-based)


