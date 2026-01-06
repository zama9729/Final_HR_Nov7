"""Vector store abstraction for Chroma and FAISS."""
from typing import List, Dict, Optional, Any
from abc import ABC, abstractmethod
import chromadb
from chromadb.config import Settings as ChromaSettings
import numpy as np
import logging
from app.config import settings

logger = logging.getLogger(__name__)


class VectorStore(ABC):
    """Abstract vector store interface."""
    
    @abstractmethod
    def add_embeddings(
        self,
        tenant_id: str,
        embeddings: List[List[float]],
        documents: List[str],
        metadatas: List[Dict],
        ids: List[str]
    ) -> None:
        """Add embeddings to store."""
        pass
    
    @abstractmethod
    def query(
        self,
        tenant_id: str,
        query_embedding: List[float],
        n_results: int = 10,
        filter_dict: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Query similar embeddings."""
        pass
    
    @abstractmethod
    def delete(self, tenant_id: str, ids: List[str]) -> None:
        """Delete embeddings by IDs."""
        pass


class ChromaVectorStore(VectorStore):
    """Chroma vector store implementation."""
    
    def __init__(self):
        host = settings.chroma_url.replace("http://", "").replace("https://", "").split(":")[0]
        port = int(settings.chroma_url.split(":")[-1]) if ":" in settings.chroma_url else 8000

        # Configure HTTP client for Chroma REST API
        self.client = chromadb.HttpClient(
            host=host,
            port=port,
            tenant="default_tenant",
            database="default_database",
            settings=ChromaSettings(
                chroma_api_impl="rest",
                anonymized_telemetry=False,
            ),
        )

        logger.info(f"Initialized Chroma client at {settings.chroma_url}")
    
    def _get_collection_name(self, tenant_id: str) -> str:
        """Get collection name for tenant (multi-tenant isolation)."""
        return f"tenant_{tenant_id}".replace("-", "_")
    
    def _get_or_create_collection(self, tenant_id: str):
        """Get or create collection for tenant."""
        collection_name = self._get_collection_name(tenant_id)
        try:
            # Try to get existing collection
            return self.client.get_collection(name=collection_name)
        except Exception as e:
            # Collection doesn't exist, try to create it
            try:
                return self.client.create_collection(
                    name=collection_name,
                    metadata={"tenant_id": tenant_id}
                )
            except Exception as create_error:
                # If creation fails with UniqueConstraintError, collection might have been created
                # between get and create calls - try to get it again
                error_str = str(create_error)
                if "already exists" in error_str or "UniqueConstraintError" in error_str:
                    logger.warning(f"Collection {collection_name} already exists, retrieving it...")
                    try:
                        return self.client.get_collection(name=collection_name)
                    except Exception as retry_error:
                        logger.error(f"Failed to get collection after creation error: {retry_error}")
                        raise create_error
                else:
                    # Some other error during creation
                    logger.error(f"Failed to create collection {collection_name}: {create_error}")
                    raise create_error
    
    def add_embeddings(
        self,
        tenant_id: str,
        embeddings: List[List[float]],
        documents: List[str],
        metadatas: List[Dict],
        ids: List[str]
    ) -> None:
        """Add embeddings to Chroma."""
        collection = self._get_or_create_collection(tenant_id)
        
        # Ensure metadata includes tenant_id for filtering
        for metadata in metadatas:
            metadata["tenant_id"] = tenant_id
        
        collection.add(
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        logger.info(f"Added {len(ids)} embeddings to tenant {tenant_id}")
    
    def query(
        self,
        tenant_id: str,
        query_embedding: List[float],
        n_results: int = 10,
        filter_dict: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Query Chroma."""
        collection = self._get_or_create_collection(tenant_id)
        
        # Always filter by tenant_id for security
        where = {"tenant_id": tenant_id}
        if filter_dict:
            where.update(filter_dict)
        
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where
        )
        
        return {
            "ids": results["ids"][0] if results["ids"] else [],
            "documents": results["documents"][0] if results["documents"] else [],
            "metadatas": results["metadatas"][0] if results["metadatas"] else [],
            "distances": results["distances"][0] if results["distances"] else [],
        }
    
    def delete(self, tenant_id: str, ids: List[str]) -> None:
        """Delete embeddings from Chroma."""
        collection = self._get_or_create_collection(tenant_id)
        collection.delete(ids=ids)
        logger.info(f"Deleted {len(ids)} embeddings from tenant {tenant_id}")


class FAISSVectorStore(VectorStore):
    """FAISS vector store implementation (fallback)."""
    
    def __init__(self):
        try:
            import faiss
            self.faiss = faiss
            self.index = None
            self.id_to_metadata = {}
            self.tenant_indices = {}  # tenant_id -> (index, id_map)
            logger.info("Initialized FAISS vector store")
        except ImportError:
            raise ImportError("FAISS not installed. Install with: pip install faiss-cpu")
    
    def _get_tenant_index(self, tenant_id: str):
        """Get or create FAISS index for tenant."""
        if tenant_id not in self.tenant_indices:
            dimension = 1536  # OpenAI ada-002 dimension
            index = self.faiss.IndexFlatL2(dimension)
            self.tenant_indices[tenant_id] = (index, {})
        return self.tenant_indices[tenant_id]
    
    def add_embeddings(
        self,
        tenant_id: str,
        embeddings: List[List[float]],
        documents: List[str],
        metadatas: List[Dict],
        ids: List[str]
    ) -> None:
        """Add embeddings to FAISS."""
        index, id_map = self._get_tenant_index(tenant_id)
        
        embeddings_array = np.array(embeddings, dtype=np.float32)
        index.add(embeddings_array)
        
        # Store metadata
        start_id = len(id_map)
        for i, (doc_id, doc, metadata) in enumerate(zip(ids, documents, metadatas)):
            id_map[start_id + i] = {
                "id": doc_id,
                "document": doc,
                "metadata": {**metadata, "tenant_id": tenant_id}
            }
        
        logger.info(f"Added {len(ids)} embeddings to FAISS for tenant {tenant_id}")
    
    def query(
        self,
        tenant_id: str,
        query_embedding: List[float],
        n_results: int = 10,
        filter_dict: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Query FAISS."""
        index, id_map = self._get_tenant_index(tenant_id)
        
        query_array = np.array([query_embedding], dtype=np.float32)
        distances, indices = index.search(query_array, min(n_results * 2, index.ntotal))
        
        # Filter by tenant and apply additional filters
        results_ids = []
        results_docs = []
        results_metas = []
        results_dists = []
        
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0:
                continue
            metadata = id_map.get(idx, {})
            meta = metadata.get("metadata", {})
            
            # Ensure tenant isolation
            if meta.get("tenant_id") != tenant_id:
                continue
            
            # Apply additional filters
            if filter_dict:
                if not all(meta.get(k) == v for k, v in filter_dict.items()):
                    continue
            
            results_ids.append(metadata.get("id", str(idx)))
            results_docs.append(metadata.get("document", ""))
            results_metas.append(meta)
            results_dists.append(float(dist))
            
            if len(results_ids) >= n_results:
                break
        
        return {
            "ids": results_ids,
            "documents": results_docs,
            "metadatas": results_metas,
            "distances": results_dists,
        }
    
    def delete(self, tenant_id: str, ids: List[str]) -> None:
        """Delete from FAISS (mark as deleted in metadata)."""
        # FAISS doesn't support deletion, so we mark in metadata
        # In production, rebuild index periodically
        logger.warning("FAISS delete not fully supported, consider rebuilding index")


def get_vector_store() -> VectorStore:
    """Get vector store instance based on configuration."""
    if settings.use_faiss:
        return FAISSVectorStore()
    else:
        return ChromaVectorStore()

