"""Tool functions for LLM function calling."""
from typing import Dict, List, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models import Employee, LeaveRequest, Paystub, Document, Tenant
from app.auth import RBACPolicy
from app.database import get_db
import uuid
import logging

logger = logging.getLogger(__name__)


class ToolRegistry:
    """Registry for callable tools."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_leave_balance(self, tenant_id: str, employee_id: str) -> Dict[str, Any]:
        """Get leave balance for employee."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            
            # Get employee
            employee = self.db.query(Employee).filter(
                Employee.id == employee_uuid,
                Employee.tenant_id == tenant_uuid
            ).first()
            
            if not employee:
                return {"error": "Employee not found"}
            
            # Calculate leave balance (simplified - in production, use leave policies)
            current_year = datetime.now().year
            approved_leaves = self.db.query(LeaveRequest).filter(
                and_(
                    LeaveRequest.tenant_id == tenant_uuid,
                    LeaveRequest.employee_id == employee_uuid,
                    LeaveRequest.status == "approved",
                    LeaveRequest.from_date >= datetime(current_year, 1, 1)
                )
            ).all()
            
            total_days = sum([
                (lr.to_date - lr.from_date).days + 1
                for lr in approved_leaves
            ])
            
            # Default: 20 days annual leave
            annual_entitlement = 20
            remaining = annual_entitlement - total_days
            
            return {
                "employee_id": employee_id,
                "annual_entitlement": annual_entitlement,
                "used_days": total_days,
                "remaining_days": max(0, remaining),
                "year": current_year
            }
        except Exception as e:
            logger.error(f"get_leave_balance failed: {e}")
            return {"error": str(e)}
    
    def list_recent_paystubs(self, tenant_id: str, employee_id: str, n: int = 3) -> List[Dict[str, Any]]:
        """List recent paystubs for employee."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            
            paystubs = self.db.query(Paystub).filter(
                and_(
                    Paystub.tenant_id == tenant_uuid,
                    Paystub.employee_id == employee_uuid
                )
            ).order_by(Paystub.pay_period_end.desc()).limit(n).all()
            
            return [
                {
                    "id": str(ps.id),
                    "pay_period_start": ps.pay_period_start.isoformat(),
                    "pay_period_end": ps.pay_period_end.isoformat(),
                    "gross_pay": ps.gross_pay,
                    "net_pay": ps.net_pay
                }
                for ps in paystubs
            ]
        except Exception as e:
            logger.error(f"list_recent_paystubs failed: {e}")
            return []
    
    def create_leave_request(
        self,
        tenant_id: str,
        employee_id: str,
        from_date: str,
        to_date: str,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a leave request."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            
            # Parse dates
            from_dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
            to_dt = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
            
            if to_dt < from_dt:
                return {"error": "End date must be after start date"}
            
            # Create leave request
            leave_request = LeaveRequest(
                tenant_id=tenant_uuid,
                employee_id=employee_uuid,
                from_date=from_dt,
                to_date=to_dt,
                reason=reason,
                status="pending"
            )
            
            self.db.add(leave_request)
            self.db.commit()
            self.db.refresh(leave_request)
            
            return {
                "id": str(leave_request.id),
                "status": leave_request.status,
                "from_date": from_date,
                "to_date": to_date,
                "message": "Leave request created successfully"
            }
        except Exception as e:
            logger.error(f"create_leave_request failed: {e}")
            self.db.rollback()
            return {"error": str(e)}
    
    def approve_leave(
        self,
        tenant_id: str,
        approver_id: str,
        leave_id: str
    ) -> Dict[str, Any]:
        """Approve a leave request (requires manager/HR/CEO role)."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            approver_uuid = uuid.UUID(approver_id)
            leave_uuid = uuid.UUID(leave_id)
            
            # Get approver
            approver = self.db.query(Employee).filter(
                Employee.id == approver_uuid,
                Employee.tenant_id == tenant_uuid
            ).first()
            
            if not approver:
                return {"error": "Approver not found"}
            
            # Check permission
            if not RBACPolicy.has_permission(approver.role, "approve_leave"):
                return {"error": "Permission denied: approver role insufficient"}
            
            # Get leave request
            leave_request = self.db.query(LeaveRequest).filter(
                LeaveRequest.id == leave_uuid,
                LeaveRequest.tenant_id == tenant_uuid
            ).first()
            
            if not leave_request:
                return {"error": "Leave request not found"}
            
            # Approve
            leave_request.status = "approved"
            leave_request.approver_id = approver_uuid
            leave_request.approved_at = datetime.utcnow()
            
            self.db.commit()
            
            return {
                "id": str(leave_request.id),
                "status": "approved",
                "approved_by": approver.email,
                "approved_at": leave_request.approved_at.isoformat()
            }
        except Exception as e:
            logger.error(f"approve_leave failed: {e}")
            self.db.rollback()
            return {"error": str(e)}
    
    def summarize_policy(self, tenant_id: str, doc_id: str) -> str:
        """Summarize a policy document."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            doc_uuid = uuid.UUID(doc_id)
            
            doc = self.db.query(Document).filter(
                Document.id == doc_uuid,
                Document.tenant_id == tenant_uuid
            ).first()
            
            if not doc:
                return "Document not found"
            
            # Get chunks
            from app.models import DocumentChunk
            chunks = self.db.query(DocumentChunk).filter(
                DocumentChunk.document_id == doc_uuid
            ).order_by(DocumentChunk.chunk_index).all()
            
            if not chunks:
                return "Document has no content"
            
            # Simple summary: first chunk + metadata
            summary = f"Policy: {doc.filename}\n\n"
            summary += f"Type: {doc.file_type}\n"
            summary += f"Confidential: {doc.is_confidential}\n\n"
            summary += "Summary:\n"
            summary += chunks[0].content_redacted[:500] + "..."
            
            return summary
        except Exception as e:
            logger.error(f"summarize_policy failed: {e}")
            return f"Error: {str(e)}"


def register_tools(llm_service, db: Session):
    """Register all tools with LLM service."""
    registry = ToolRegistry(db)
    
    # Register each tool
    llm_service.register_tool(
        "get_leave_balance",
        registry.get_leave_balance,
        "Get leave balance for an employee",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "employee_id": {"type": "string", "description": "Employee ID"}
            },
            "required": ["tenant_id", "employee_id"]
        }
    )
    
    llm_service.register_tool(
        "list_recent_paystubs",
        registry.list_recent_paystubs,
        "List recent paystubs for an employee",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "employee_id": {"type": "string", "description": "Employee ID"},
                "n": {"type": "integer", "description": "Number of paystubs to return", "default": 3}
            },
            "required": ["tenant_id", "employee_id"]
        }
    )
    
    llm_service.register_tool(
        "create_leave_request",
        registry.create_leave_request,
        "Create a new leave request",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "employee_id": {"type": "string", "description": "Employee ID"},
                "from_date": {"type": "string", "description": "Start date (ISO format)"},
                "to_date": {"type": "string", "description": "End date (ISO format)"},
                "reason": {"type": "string", "description": "Reason for leave"}
            },
            "required": ["tenant_id", "employee_id", "from_date", "to_date"]
        }
    )
    
    llm_service.register_tool(
        "approve_leave",
        registry.approve_leave,
        "Approve a leave request (requires manager/HR/CEO role)",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "approver_id": {"type": "string", "description": "Approver employee ID"},
                "leave_id": {"type": "string", "description": "Leave request ID"}
            },
            "required": ["tenant_id", "approver_id", "leave_id"]
        }
    )
    
    llm_service.register_tool(
        "summarize_policy",
        registry.summarize_policy,
        "Summarize a policy document",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "doc_id": {"type": "string", "description": "Document ID"}
            },
            "required": ["tenant_id", "doc_id"]
        }
    )
    
    logger.info("Registered all tools with LLM service")

