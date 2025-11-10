"""FastAPI main application."""
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import uuid
import logging
import time
from datetime import datetime

from app.database import get_db, Base, engine
from app.models import (
    Tenant, Employee, Document, DocumentChunk,
    LeaveRequest, Paystub, AuditLog
)
from app.auth import (
    get_current_user, get_current_tenant,
    require_permission, create_access_token
)
from app.rag_service import RAGService
from app.ingestion import document_ingester
from app.llm_service import llm_service
from app.config import settings
from app.tools import ToolRegistry
from fastapi import Path
# Structured logging (optional - falls back to standard logging)
try:
    import structlog
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=False,
    )
    logger = structlog.get_logger()
except ImportError:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="HR RAG Service",
    description="Multi-tenant RAG service for HR/Employee Management",
    version="1.0.0"
)

# CORS - Allow HR app origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://localhost:3000",
        "http://localhost:3300",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3300",
        "*"  # Allow all in development, restrict in production
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Request/Response models
class QueryRequest(BaseModel):
    query: str
    top_k: Optional[int] = None
    use_tools: bool = True


class QueryResponse(BaseModel):
    answer: str
    provenance: dict
    tool_calls: List[dict]
    latency_ms: int
    request_id: str


class IngestResponse(BaseModel):
    job_id: str
    document_id: str
    status: str
    message: str

class DocumentStatusResponse(BaseModel):
    document_id: str
    status: str
    message: Optional[str] = None

class DocumentProgressResponse(BaseModel):
    document_id: str
    status: str
    total_chunks: int
    processed_chunks: int
    percent: int


class ToolCallRequest(BaseModel):
    tool_name: str
    arguments: dict


# Audit logging helper
def log_audit(
    db: Session,
    tenant_id: uuid.UUID,
    user_id: Optional[uuid.UUID],
    user_role: Optional[str],
    action: str,
    request_id: str,
    query_text: Optional[str] = None,
    top_doc_ids: Optional[List[str]] = None,
    llm_response: Optional[str] = None,
    confidence_score: Optional[float] = None,
    tool_calls: Optional[List[dict]] = None,
    error_message: Optional[str] = None,
    latency_ms: Optional[int] = None
):
    """Log audit entry."""
    try:
        # Redact PII from query and response
        query_redacted = None
        if query_text:
            from app.pii_detection import pii_detector
            query_redacted = pii_detector.redact_pii(query_text)
        
        response_redacted = None
        if llm_response:
            from app.pii_detection import pii_detector
            response_redacted = pii_detector.redact_pii(llm_response)
        
        audit = AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            user_role=user_role,
            request_id=request_id,
            action=action,
            query_text=query_redacted,
            top_doc_ids=top_doc_ids,
            llm_response=response_redacted,
            confidence_score=confidence_score,
            tool_calls=tool_calls,
            error_message=error_message,
            latency_ms=latency_ms,
            prompt_version="v1.0"
        )
        db.add(audit)
        db.commit()
    except Exception as e:
        logger.error(f"Audit logging failed: {e}")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/v1/query", response_model=QueryResponse)
async def query_rag(
    request: QueryRequest,
    user: Employee = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """RAG query endpoint."""
    request_id = str(uuid.uuid4())
    start_time = time.time()
    
    try:
        rag_service = RAGService(db)
        result = rag_service.query(
            query=request.query,
            tenant_id=tenant.id,
            user_id=user.id,
            top_k=request.top_k,
            use_tools=request.use_tools
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Log audit
        log_audit(
            db=db,
            tenant_id=tenant.id,
            user_id=user.id,
            user_role=user.role,
            action="query",
            request_id=request_id,
            query_text=request.query,
            top_doc_ids=result["provenance"].get("top_doc_ids", []),
            llm_response=result["answer"],
            confidence_score=result["provenance"].get("confidence"),
            tool_calls=result.get("tool_calls", []),
            latency_ms=latency_ms
        )
        
        return QueryResponse(
            answer=result["answer"],
            provenance=result["provenance"],
            tool_calls=result.get("tool_calls", []),
            latency_ms=latency_ms,
            request_id=request_id
        )
    except Exception as e:
        logger.error(f"Query failed: {e}")
        latency_ms = int((time.time() - start_time) * 1000)
        
        log_audit(
            db=db,
            tenant_id=tenant.id,
            user_id=user.id,
            user_role=user.role,
            action="query",
            request_id=request_id,
            query_text=request.query,
            error_message=str(e),
            latency_ms=latency_ms
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query failed: {str(e)}"
        )

@app.get("/api/v1/documents/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: str = Path(..., description="Document ID (UUID)"),
    user: Employee = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """Get ingestion status for a document."""
    try:
        doc = db.query(Document).filter(
            Document.id == uuid.UUID(document_id),
            Document.tenant_id == tenant.id
        ).first()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        return DocumentStatusResponse(
            document_id=document_id,
            status=doc.ingestion_status or "pending",
            message="Processing complete" if doc.ingestion_status == "completed" else "Processing"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get document status")

@app.get("/api/v1/documents/{document_id}/progress", response_model=DocumentProgressResponse)
async def get_document_progress(
    document_id: str = Path(..., description="Document ID (UUID)"),
    user: Employee = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    """Get ingestion progress for a document based on chunk embeddings."""
    try:
        doc = db.query(Document).filter(
            Document.id == uuid.UUID(document_id),
            Document.tenant_id == tenant.id
        ).first()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        
        from app.models import DocumentChunk
        total = db.query(DocumentChunk).filter(
            DocumentChunk.document_id == doc.id
        ).count()
        processed = db.query(DocumentChunk).filter(
            DocumentChunk.document_id == doc.id,
            DocumentChunk.embedding_id.isnot(None)
        ).count()
        percent = int((processed / total) * 100) if total > 0 else 0
        
        return DocumentProgressResponse(
            document_id=document_id,
            status=doc.ingestion_status or "pending",
            total_chunks=total,
            processed_chunks=processed,
            percent=percent
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document progress: {e}")
        raise HTTPException(status_code=500, detail="Failed to get document progress")


@app.post("/api/v1/ingest", response_model=IngestResponse)
async def ingest_document(
    file: UploadFile = File(...),
    is_confidential: bool = False,
    user: Employee = Depends(require_permission("query")),  # Any authenticated user can ingest
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """Document ingestion endpoint."""
    # Validate file type
    file_ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if file_ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {file_ext} not allowed"
        )
    
    # Save file temporarily
    import os
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f"{uuid.uuid4()}_{file.filename}")
    
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            if len(content) > settings.max_upload_size_mb * 1024 * 1024:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File too large (max {settings.max_upload_size_mb}MB)"
                )
            f.write(content)
        
        # Process document
        doc = document_ingester.process_document(
            file_path=file_path,
            tenant_id=tenant.id,
            filename=file.filename,
            is_confidential=is_confidential,
            db=db
        )
        
        # Enqueue embedding job (Celery)
        from app.celery_app import ingest_document_task
        job = ingest_document_task.delay(str(doc.id))
        
        doc.ingestion_job_id = job.id
        db.commit()
        
        return IngestResponse(
            job_id=job.id,
            document_id=str(doc.id),
            status="processing",
            message="Document ingestion started"
        )
    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {str(e)}"
        )


@app.post("/api/v1/tool_call")
async def tool_call(
    request: ToolCallRequest,
    user: Employee = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """Direct tool call endpoint (for internal use)."""
    registry = ToolRegistry(db)
    
    # Get tool function
    tool_func = getattr(registry, request.tool_name, None)
    if not tool_func:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool {request.tool_name} not found"
        )
    
    # Add tenant_id and user context to arguments
    args = request.arguments.copy()
    args["tenant_id"] = str(tenant.id)
    if "employee_id" not in args:
        args["employee_id"] = str(user.id)
    
    try:
        result = tool_func(**args)
        return {"result": result}
    except Exception as e:
        logger.error(f"Tool call failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Tool call failed: {str(e)}"
        )


@app.get("/api/v1/audit")
async def get_audit_logs(
    limit: int = 100,
    user: Employee = Depends(require_permission("query")),  # Admin-only in production
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    """Get audit logs (admin-only)."""
    # In production, add role check: if user.role not in ["hr", "ceo", "admin"]: raise 403
    
    logs = db.query(AuditLog).filter(
        AuditLog.tenant_id == tenant.id
    ).order_by(AuditLog.created_at.desc()).limit(limit).all()
    
    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "user_role": log.user_role,
            "action": log.action,
            "query_text": log.query_text,
            "confidence_score": log.confidence_score,
            "latency_ms": log.latency_ms,
            "created_at": log.created_at.isoformat()
        }
        for log in logs
    ]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

