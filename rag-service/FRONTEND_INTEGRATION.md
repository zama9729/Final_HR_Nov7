# Frontend Integration Guide

The RAG service is now integrated into the HR app frontend!

## What's Integrated

### 1. RAG Assistant Component (`src/components/RAGAssistant.tsx`)
- Full-featured chat interface
- Connects to RAG service API
- Shows provenance (source documents)
- Displays tool calls and confidence scores
- Conversation history (localStorage)

### 2. Updated AI Assistant Page (`src/pages/AIAssistantPage.tsx`)
- Now uses RAG-powered assistant
- Shows RAG features and capabilities

### 3. Document Upload Page (`src/pages/RAGDocumentUpload.tsx`)
- Upload PDF, DOCX, TXT, MD files
- Mark documents as confidential
- Track upload status

### 4. API Client Methods (`src/lib/api.ts`)
- `queryRAG()` - Query the RAG service
- `ingestDocument()` - Upload documents
- `getRAGAuditLogs()` - View audit logs

## Configuration

Add to your `.env` file:

```bash
VITE_RAG_API_URL=http://localhost:8001
```

If not set, defaults to `http://localhost:8001`.

## Routes

- `/ai-assistant` - RAG-powered AI assistant (all users)
- `/rag/upload` - Document upload page (HR/CEO/Admin only)

## Usage

### For Users

1. Navigate to `/ai-assistant` or click the floating bot button
2. Ask questions like:
   - "What is my leave balance?"
   - "Create a leave request for next week"
   - "What is the company leave policy?"
3. See source citations and confidence scores

### For HR/Admins

1. Navigate to `/rag/upload`
2. Upload HR documents (policies, handbooks)
3. Documents are automatically processed and indexed
4. Available for queries within minutes

## Features

✅ **RAG-Powered**: Answers backed by your documents  
✅ **Tool Calling**: Can perform actions (create leave requests, etc.)  
✅ **Source Citations**: See which documents were used  
✅ **Confidence Scores**: Know how reliable the answer is  
✅ **PII Protection**: Automatic redaction  
✅ **Multi-tenant**: Isolated per organization  

## Next Steps

1. Start RAG service: `cd rag-service && docker-compose up -d`
2. Set `VITE_RAG_API_URL` in frontend `.env`
3. Upload documents via `/rag/upload`
4. Start querying via `/ai-assistant`

## Troubleshooting

### RAG service not responding
- Check RAG service is running: `curl http://localhost:8001/health`
- Verify `VITE_RAG_API_URL` is set correctly

### Authentication errors
- Ensure JWT token includes `tenant_id` claim
- Check token is valid and not expired

### Documents not appearing in queries
- Check Celery worker is processing: `docker-compose logs celery-worker`
- Verify document ingestion status in database

