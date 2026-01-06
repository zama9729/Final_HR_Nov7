# RAG Service ChromaDB Collection Fix

## Problem
The RAG service was returning 500 errors with:
```
UniqueConstraintError('Collection tenant_bbc91f1c_6289_4b44_a5ab_a7d153c4c12c already exists')
```

## Root Cause
The `_get_or_create_collection` method in `vector_store.py` had a race condition:
1. It tried to get a collection
2. If that failed, it tried to create it
3. However, if the collection was created between the get and create calls (or if get failed for other reasons), the create would fail with UniqueConstraintError

## Fix Applied

### Improved Error Handling
Updated `_get_or_create_collection` to:
1. Try to get the collection first
2. If get fails, try to create it
3. If creation fails with "already exists" or "UniqueConstraintError":
   - Log a warning
   - Try to get the collection again (handles race conditions)
   - If that also fails, raise the original error
4. For other creation errors, raise them normally

### Code Changes
- Enhanced exception handling to catch `UniqueConstraintError` and "already exists" errors
- Added retry logic to get collection after creation error
- Added better logging for debugging

## Files Modified
- `rag-service/app/vector_store.py`

## Testing

1. The RAG service should now handle existing collections gracefully
2. Try sending a query through the HR Assistant chatbox
3. The service should work even if the collection already exists
4. Check RAG service logs for any remaining errors

## Expected Behavior

After the fix:
- Collections that already exist will be retrieved instead of causing errors
- Race conditions between get/create operations are handled
- The service should process queries without 500 errors related to collections

