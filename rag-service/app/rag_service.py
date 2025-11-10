"""RAG (Retrieval-Augmented Generation) service."""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models import DocumentChunk, Tenant
from app.vector_store import get_vector_store
from app.llm_service import llm_service
from app.pii_detection import pii_detector
from app.config import settings
from app.tools import register_tools
import logging
import uuid
import time

logger = logging.getLogger(__name__)


class RAGService:
    """RAG service for query processing."""
    
    def __init__(self, db: Session):
        self.db = db
        self.vector_store = get_vector_store()
        # Register tools with LLM
        register_tools(llm_service, db)
    
    def query(
        self,
        query: str,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        top_k: Optional[int] = None,
        use_tools: bool = True
    ) -> Dict[str, Any]:
        """Process RAG query."""
        start_time = time.time()
        top_k = top_k or settings.top_k_retrieval
        
        try:
            # Redact PII from query
            query_redacted = pii_detector.redact_pii(query)
            
            # Get embedding for query
            query_embedding = llm_service.get_embedding(query_redacted)
            
            # Retrieve similar chunks
            retrieval_results = self.vector_store.query(
                tenant_id=str(tenant_id),
                query_embedding=query_embedding,
                n_results=top_k
            )
            
            # Get chunk IDs and documents
            chunk_ids = retrieval_results.get("ids", [])
            chunk_docs = retrieval_results.get("documents", [])
            chunk_metas = retrieval_results.get("metadatas", [])
            distances = retrieval_results.get("distances", [])
            
            # Fetch chunk records from DB for metadata
            chunks = []
            if chunk_ids:
                chunk_records = self.db.query(DocumentChunk).filter(
                    DocumentChunk.id.in_([uuid.UUID(cid) for cid in chunk_ids if cid])
                ).all()
                
                chunk_map = {str(c.id): c for c in chunk_records}
                for cid, doc, meta, dist in zip(chunk_ids, chunk_docs, chunk_metas, distances):
                    if cid in chunk_map:
                        chunks.append({
                            "id": cid,
                            "content": chunk_map[cid].content_redacted or doc,
                            "metadata": {**meta, **chunk_map[cid].chunk_metadata},
                            "distance": dist,
                            "document_id": str(chunk_map[cid].document_id)
                        })
            
            # Rerank if enabled (simple distance-based for now)
            if settings.rerank_enabled and len(chunks) > settings.top_k_final:
                chunks = sorted(chunks, key=lambda x: x["distance"])[:settings.top_k_final]
            else:
                chunks = chunks[:settings.top_k_final]
            
            # Prepare context
            context_chunks = [c["content"] for c in chunks]
            
            # Generate response with LLM
            llm_result = llm_service.generate_with_rag(
                query=query_redacted,
                context_chunks=context_chunks,
                use_tools=use_tools
            )
            
            # Calculate confidence (heuristic: based on distance and tool calls)
            confidence = self._calculate_confidence(chunks, llm_result)
            
            response_text = llm_result.get("content", "")
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            return {
                "answer": response_text,
                "provenance": {
                    "top_doc_ids": [c["document_id"] for c in chunks],
                    "chunk_ids": [c["id"] for c in chunks],
                    "snippets": [c["content"][:200] + "..." for c in chunks],
                    "confidence": confidence
                },
                "tool_calls": llm_result.get("tool_calls", []),
                "latency_ms": latency_ms
            }
        except Exception as e:
            logger.error(f"RAG query failed: {e}")
            raise
    
    def _calculate_confidence(self, chunks: List[Dict], llm_result: Dict) -> float:
        """Calculate confidence score."""
        if not chunks:
            return 0.0
        
        # Base confidence from retrieval distance (lower distance = higher confidence)
        avg_distance = sum(c.get("distance", 1.0) for c in chunks) / len(chunks)
        distance_confidence = max(0.0, 1.0 - min(avg_distance, 1.0))
        
        # Boost if tool calls succeeded
        tool_confidence = 1.0
        if llm_result.get("tool_calls"):
            successful_tools = sum(1 for tc in llm_result["tool_calls"] if "error" not in tc)
            tool_confidence = successful_tools / len(llm_result["tool_calls"]) if llm_result["tool_calls"] else 1.0
        
        # Combined confidence
        confidence = (distance_confidence * 0.7 + tool_confidence * 0.3)
        return min(1.0, max(0.0, confidence))
    
    def ingest_document_chunks(
        self,
        tenant_id: uuid.UUID,
        chunks: List[DocumentChunk],
        embeddings: List[List[float]]
    ) -> None:
        """Ingest document chunks into vector store."""
        try:
            ids = [str(c.id) for c in chunks]
            documents = [c.content_redacted or c.content for c in chunks]
            metadatas = [
                {
                    **c.chunk_metadata,
                    "document_id": str(c.document_id),
                    "chunk_index": c.chunk_index
                }
                for c in chunks
            ]
            
            self.vector_store.add_embeddings(
                tenant_id=str(tenant_id),
                embeddings=embeddings,
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            
            logger.info(f"Ingested {len(chunks)} chunks for tenant {tenant_id}")
        except Exception as e:
            logger.error(f"Vector store ingestion failed: {e}")
            raise

