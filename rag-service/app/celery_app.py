"""Celery application for async tasks."""
from celery import Celery
from app.config import settings
from app.database import SessionLocal
from app.models import Document, DocumentChunk
from app.llm_service import llm_service
from app.rag_service import RAGService
import logging

logger = logging.getLogger(__name__)

# Create Celery app
celery_app = Celery(
    "rag_service",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)


@celery_app.task(name="ingest_document")
def ingest_document_task(document_id: str):
    """Async task to ingest document and generate embeddings."""
    db = SessionLocal()
    try:
        # Get document
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            logger.error(f"Document {document_id} not found")
            return {"status": "error", "message": "Document not found"}
        
        if doc.ingestion_status == "completed":
            logger.info(f"Document {document_id} already processed")
            return {"status": "completed", "document_id": document_id}
        
        # Get chunks
        chunks = db.query(DocumentChunk).filter(
            DocumentChunk.document_id == doc.id
        ).order_by(DocumentChunk.chunk_index).all()
        
        if not chunks:
            logger.error(f"No chunks found for document {document_id}")
            doc.ingestion_status = "failed"
            db.commit()
            return {"status": "error", "message": "No chunks found"}
        
        # Generate embeddings
        embeddings = []
        for chunk in chunks:
            try:
                # Use redacted content for embedding
                content = chunk.content_redacted or chunk.content
                embedding = llm_service.get_embedding(content)
                embeddings.append(embedding)
            except Exception as e:
                logger.error(f"Embedding generation failed for chunk {chunk.id}: {e}")
                embeddings.append(None)
        
        # Filter out failed embeddings
        valid_chunks = [c for c, e in zip(chunks, embeddings) if e is not None]
        valid_embeddings = [e for e in embeddings if e is not None]
        
        if not valid_chunks:
            logger.error(f"No valid embeddings generated for document {document_id}")
            doc.ingestion_status = "failed"
            db.commit()
            return {"status": "error", "message": "Embedding generation failed"}
        
        # Ingest into vector store
        rag_service = RAGService(db)
        rag_service.ingest_document_chunks(
            tenant_id=doc.tenant_id,
            chunks=valid_chunks,
            embeddings=valid_embeddings
        )
        
        # Update chunk embedding IDs
        for chunk in valid_chunks:
            chunk.embedding_id = str(chunk.id)
        
        doc.ingestion_status = "completed"
        db.commit()
        
        logger.info(f"Successfully ingested document {document_id} with {len(valid_chunks)} chunks")
        return {
            "status": "completed",
            "document_id": document_id,
            "chunks_ingested": len(valid_chunks)
        }
    except Exception as e:
        logger.error(f"Document ingestion task failed: {e}")
        if doc:
            doc.ingestion_status = "failed"
            db.commit()
        return {"status": "error", "message": str(e)}
    finally:
        db.close()

