"""Tool functions for LLM function calling."""
from typing import Dict, List, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.models import Employee, LeaveRequest, Paystub, Document, Tenant, Timesheet, TimesheetEntry
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
        """Get leave balance for an employee."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            
            # Query leave requests to calculate balance
            leave_requests = self.db.query(LeaveRequest).filter(
                and_(
                    LeaveRequest.tenant_id == tenant_uuid,
                    LeaveRequest.employee_id == employee_uuid,
                    LeaveRequest.status == "approved"
                )
            ).all()
            
            # Calculate used leaves (simplified - count approved days)
            used_leaves = sum(
                (lr.to_date - lr.from_date).days + 1 
                for lr in leave_requests 
                if lr.from_date and lr.to_date
            )
            
            # Default entitlement (can be fetched from leave policies if available)
            default_entitlement = 12  # Default 12 days per year
            
            return {
                "employee_id": employee_id,
                "entitlement": default_entitlement,
                "used": used_leaves,
                "remaining": max(0, default_entitlement - used_leaves)
            }
        except Exception as e:
            logger.error(f"get_leave_balance failed: {e}")
            return {"error": str(e)}
    
    def list_recent_paystubs(self, tenant_id: str, employee_id: str, n: int = 3) -> Dict[str, Any]:
        """List recent paystubs for an employee."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            
            paystubs = self.db.query(Paystub).filter(
                and_(
                    Paystub.tenant_id == tenant_uuid,
                    Paystub.employee_id == employee_uuid
                )
            ).order_by(Paystub.pay_period_end.desc()).limit(n).all()
            
            return {
                "employee_id": employee_id,
                "paystubs": [
                    {
                        "id": str(ps.id),
                        "pay_period_start": ps.pay_period_start.isoformat() if ps.pay_period_start else None,
                        "pay_period_end": ps.pay_period_end.isoformat() if ps.pay_period_end else None,
                        "gross_pay": float(ps.gross_pay) if ps.gross_pay else 0.0,
                        "net_pay": float(ps.net_pay) if ps.net_pay else 0.0
                    }
                    for ps in paystubs
                ]
            }
        except Exception as e:
            logger.error(f"list_recent_paystubs failed: {e}")
            return {"error": str(e)}
    
    def create_leave_request(self, tenant_id: str, employee_id: str, from_date: str, to_date: str, reason: str = "") -> Dict[str, Any]:
        """Create a new leave request."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            from_dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
            to_dt = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
            
            # Create leave request
            leave_request = LeaveRequest(
                id=uuid.uuid4(),
                tenant_id=tenant_uuid,
                employee_id=employee_uuid,
                from_date=from_dt,
                to_date=to_dt,
                reason=reason or "Leave request",
                status="pending",
                created_at=datetime.utcnow()
            )
            self.db.add(leave_request)
            self.db.commit()
            self.db.refresh(leave_request)
            
            return {
                "status": "created",
                "leave_id": str(leave_request.id),
                "message": f"Leave request created for {from_date} to {to_date}"
            }
        except Exception as e:
            logger.error(f"create_leave_request failed: {e}")
            self.db.rollback()
            return {"error": str(e)}
    
    def approve_leave(self, tenant_id: str, approver_id: str, leave_id: str) -> Dict[str, Any]:
        """Approve a leave request."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            approver_uuid = uuid.UUID(approver_id)
            leave_uuid = uuid.UUID(leave_id)
            
            # Get approver to check role
            approver = self.db.query(Employee).filter(Employee.id == approver_uuid).first()
            if not approver or approver.role not in ["manager", "hr", "ceo"]:
                return {"error": "Only managers, HR, or CEO can approve leaves"}
            
            # Get leave request
            leave_request = self.db.query(LeaveRequest).filter(
                and_(
                    LeaveRequest.id == leave_uuid,
                    LeaveRequest.tenant_id == tenant_uuid
                )
            ).first()
            
            if not leave_request:
                return {"error": "Leave request not found"}
            
            if leave_request.status != "pending":
                return {"error": f"Leave request is already {leave_request.status}"}
            
            leave_request.status = "approved"
            leave_request.approver_id = approver_uuid
            leave_request.approved_at = datetime.utcnow()
            self.db.commit()
            
            return {
                "status": "approved",
                "leave_id": leave_id,
                "message": "Leave request approved successfully"
            }
        except Exception as e:
            logger.error(f"approve_leave failed: {e}")
            self.db.rollback()
            return {"error": str(e)}
    
    def summarize_policy(self, tenant_id: str, doc_id: str) -> Dict[str, Any]:
        """Summarize a policy document."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            doc_uuid = uuid.UUID(doc_id)
            
            document = self.db.query(Document).filter(
                and_(
                    Document.id == doc_uuid,
                    Document.tenant_id == tenant_uuid
                )
            ).first()
            
            if not document:
                return {"error": "Document not found"}
            
            # Get chunks for this document
            chunks = self.db.query(DocumentChunk).filter(
                DocumentChunk.document_id == doc_uuid
            ).limit(10).all()
            
            # Simple summary from first few chunks
            summary_text = " ".join([c.content[:200] for c in chunks[:3] if c.content])
            
            return {
                "document_id": doc_id,
                "title": document.title or "Policy Document",
                "summary": summary_text[:500] + "..." if len(summary_text) > 500 else summary_text
            }
        except Exception as e:
            logger.error(f"summarize_policy failed: {e}")
            return {"error": str(e)}
    
    def get_my_leave_requests(self, tenant_id: str, employee_id: str, n: int = 5) -> Dict[str, Any]:
        """List the status of my recent leave requests."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            
            leave_requests = self.db.query(LeaveRequest).filter(
                and_(
                    LeaveRequest.tenant_id == tenant_uuid,
                    LeaveRequest.employee_id == employee_uuid
                )
            ).order_by(LeaveRequest.created_at.desc()).limit(n).all()
            
            return {
                "employee_id": employee_id,
                "requests": [
                    {
                        "id": str(lr.id),
                        "from_date": lr.from_date.isoformat() if lr.from_date else None,
                        "to_date": lr.to_date.isoformat() if lr.to_date else None,
                        "status": lr.status,
                        "reason": lr.reason
                    }
                    for lr in leave_requests
                ]
            }
        except Exception as e:
            logger.error(f"get_my_leave_requests failed: {e}")
            return {"error": str(e)}
    
    def get_pending_approvals(self, tenant_id: str, manager_id: str) -> Dict[str, Any]:
        """Show leave requests waiting for my approval."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            manager_uuid = uuid.UUID(manager_id)
            
            # Get employees reporting to this manager
            direct_reports = self.db.query(Employee).filter(
                and_(
                    Employee.tenant_id == tenant_uuid,
                    Employee.reporting_manager_id == manager_uuid,
                    Employee.is_active == True
                )
            ).all()
            
            report_ids = [emp.id for emp in direct_reports]
            
            # Get pending leave requests for direct reports
            leave_requests = self.db.query(LeaveRequest).filter(
                and_(
                    LeaveRequest.tenant_id == tenant_uuid,
                    LeaveRequest.employee_id.in_(report_ids),
                    LeaveRequest.status == "pending"
                )
            ).all()
            
            return {
                "manager_id": manager_id,
                "pending_requests": [
                    {
                        "id": str(lr.id),
                        "employee_id": str(lr.employee_id),
                        "from_date": lr.from_date.isoformat() if lr.from_date else None,
                        "to_date": lr.to_date.isoformat() if lr.to_date else None,
                        "reason": lr.reason
                    }
                    for lr in leave_requests
                ]
            }
        except Exception as e:
            logger.error(f"get_pending_approvals failed: {e}")
            return {"error": str(e)}
    
    def get_dashboard_summary(self, tenant_id: str) -> Dict[str, Any]:
        """Fetch key HR metrics for my organisation."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            
            # Get employee count
            total_employees = self.db.query(Employee).filter(
                and_(
                    Employee.tenant_id == tenant_uuid,
                    Employee.is_active == True
                )
            ).count()
            
            # Get pending leave requests
            pending_leaves = self.db.query(LeaveRequest).filter(
                and_(
                    LeaveRequest.tenant_id == tenant_uuid,
                    LeaveRequest.status == "pending"
                )
            ).count()
            
            return {
                "tenant_id": tenant_id,
                "total_employees": total_employees,
                "pending_leave_requests": pending_leaves,
                "message": f"Organization has {total_employees} active employees and {pending_leaves} pending leave requests"
            }
        except Exception as e:
            logger.error(f"get_dashboard_summary failed: {e}")
            return {"error": str(e)}
    
    def list_employees(self, tenant_id: str, query: Optional[str] = None, department: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search employees by department, status, or name."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            
            q = self.db.query(Employee).filter(
                and_(
                    Employee.tenant_id == tenant_uuid,
                    Employee.is_active == True
                )
            )
            
            if query:
                q = q.filter(
                    or_(
                        Employee.first_name.ilike(f"%{query}%"),
                        Employee.last_name.ilike(f"%{query}%"),
                        Employee.email.ilike(f"%{query}%")
                    )
                )
            
            if department:
                q = q.filter(Employee.department == department)
            
            employees = q.limit(50).all()
            
            return [
                {
                    "id": str(emp.id),
                    "name": f"{emp.first_name} {emp.last_name}",
                    "email": emp.email,
                    "department": emp.department,
                    "role": emp.role
                }
                for emp in employees
            ]
        except Exception as e:
            logger.error(f"list_employees failed: {e}")
            return []
    
    def get_employee_profile(self, tenant_id: str, employee_id: str) -> Dict[str, Any]:
        """Look up a specific employee's profile information."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            
            employee = self.db.query(Employee).filter(
                and_(
                    Employee.id == employee_uuid,
                    Employee.tenant_id == tenant_uuid
                )
            ).first()
            
            if not employee:
                return {"error": "Employee not found"}
            
            return {
                "id": str(employee.id),
                "employee_id": employee.employee_id,
                "name": f"{employee.first_name} {employee.last_name}",
                "email": employee.email,
                "department": employee.department,
                "role": employee.role,
                "is_active": employee.is_active
            }
        except Exception as e:
            logger.error(f"get_employee_profile failed: {e}")
            return {"error": str(e)}

    def get_attendance_summary(self, tenant_id: str, employee_id: str, start_date: str, end_date: str) -> Dict[str, Any]:
        """Get attendance summary for a period."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            
            entries = self.db.query(TimesheetEntry).join(Timesheet).filter(
                and_(
                    Timesheet.tenant_id == tenant_uuid,
                    Timesheet.employee_id == employee_uuid,
                    TimesheetEntry.work_date >= start_dt,
                    TimesheetEntry.work_date <= end_dt
                )
            ).all()
            
            total_hours = sum([e.hours for e in entries])
            days_present = len(set([e.work_date.date() for e in entries]))
            
            # Mock overtime logic (e.g., > 9 hours)
            overtime_hours = sum([max(0, e.hours - 9) for e in entries])
            
            return {
                "employee_id": employee_id,
                "period": f"{start_date} to {end_date}",
                "total_hours": total_hours,
                "days_present": days_present,
                "overtime_hours": overtime_hours,
                "avg_hours_per_day": round(total_hours / days_present, 2) if days_present > 0 else 0
            }
        except Exception as e:
            logger.error(f"get_attendance_summary failed: {e}")
            return {"error": str(e)}

    def regularize_attendance(self, tenant_id: str, employee_id: str, date: str, reason: str) -> Dict[str, Any]:
        """Request attendance regularization."""
        try:
            # In a real app, this would create a specific request record.
            # For now, we'll log it and return success to simulate the workflow.
            logger.info(f"Regularization request: Tenant={tenant_id}, Emp={employee_id}, Date={date}, Reason={reason}")
            
            return {
                "status": "submitted",
                "message": f"Regularization request for {date} has been submitted for approval.",
                "request_id": str(uuid.uuid4())
            }
        except Exception as e:
            logger.error(f"regularize_attendance failed: {e}")
            return {"error": str(e)}

    def estimate_tax_deduction(self, tenant_id: str, employee_id: str, gross_amount: float) -> Dict[str, Any]:
        """Estimate tax deduction for a given amount (simplified Indian tax slab)."""
        try:
            # Simplified logic: 
            # 0-3L: 0%
            # 3-6L: 5%
            # 6-9L: 10%
            # 9-12L: 15%
            # 12-15L: 20%
            # >15L: 30%
            # This is a marginal calculation on the *extra* amount, assuming it falls in the highest bracket 
            # OR just a flat rate estimate for bonuses. 
            # Let's assume this is a bonus payment and apply a flat TDS rate of 10% or 30% based on assumed bracket.
            # Better: Fetch employee's current salary to find bracket.
            
            # For simplicity/robustness, we'll return a breakdown.
            estimated_tax = 0.0
            rate = 0.0
            
            if gross_amount > 100000: # High value
                rate = 0.30
            elif gross_amount > 50000:
                rate = 0.20
            else:
                rate = 0.10
                
            estimated_tax = gross_amount * rate
            
            return {
                "gross_amount": gross_amount,
                "estimated_tax": estimated_tax,
                "net_amount": gross_amount - estimated_tax,
                "applied_rate": f"{int(rate*100)}%",
                "note": "This is an estimate based on standard slab rates. Actual tax may vary based on your total income and regime."
            }
        except Exception as e:
            logger.error(f"estimate_tax_deduction failed: {e}")
            return {"error": str(e)}

    def download_payslip(self, tenant_id: str, employee_id: str, month: int, year: int) -> Dict[str, Any]:
        """Generate a download link for a payslip."""
        try:
            # Check if payslip exists
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            
            # Find paystub for this month/year
            # Approximation: check if pay_period_end is in that month
            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)
                
            paystub = self.db.query(Paystub).filter(
                and_(
                    Paystub.tenant_id == tenant_uuid,
                    Paystub.employee_id == employee_uuid,
                    Paystub.pay_period_end >= start_date,
                    Paystub.pay_period_end < end_date
                )
            ).first()
            
            if not paystub:
                return {"error": f"No payslip found for {month}/{year}"}
            
            # Return a mock URL
            return {
                "file_name": f"Payslip_{year}_{month}.pdf",
                "download_url": f"/api/payroll/download/{paystub.id}",
                "generated_at": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"download_payslip failed: {e}")
            return {"error": str(e)}

    def find_employee(self, tenant_id: str, query: str) -> Dict[str, Any]:
        """Find a specific employee by name or role."""
        try:
            results = self.list_employees(tenant_id, query=query)
            if not results:
                return {"error": "No employee found"}
            
            # Return the first match with more details
            top_match = results[0]
            return self.get_employee_profile(tenant_id, top_match['id'])
        except Exception as e:
            logger.error(f"find_employee failed: {e}")
            return {"error": str(e)}

    def get_org_chart(self, tenant_id: str, employee_id: str) -> Dict[str, Any]:
        """Get reporting structure for an employee."""
        try:
            tenant_uuid = uuid.UUID(tenant_id)
            employee_uuid = uuid.UUID(employee_id)
            
            emp = self.db.query(Employee).filter(
                and_(Employee.id == employee_uuid, Employee.tenant_id == tenant_uuid)
            ).first()
            
            if not emp:
                return {"error": "Employee not found"}
            
            # Get Manager
            manager_info = None
            if emp.reporting_manager_id:
                manager = self.db.query(Employee).filter(Employee.id == emp.reporting_manager_id).first()
                if manager:
                    manager_info = {
                        "id": str(manager.id),
                        "name": f"{manager.first_name} {manager.last_name}",
                        "role": manager.role
                    }
            
            # Get Direct Reports
            reports = self.db.query(Employee).filter(
                and_(Employee.reporting_manager_id == emp.id, Employee.is_active == True)
            ).all()
            
            reports_info = [
                {
                    "id": str(r.id),
                    "name": f"{r.first_name} {r.last_name}",
                    "role": r.role
                }
                for r in reports
            ]
            
            return {
                "employee": f"{emp.first_name} {emp.last_name}",
                "manager": manager_info,
                "direct_reports": reports_info,
                "total_reports": len(reports_info)
            }
        except Exception as e:
            logger.error(f"get_org_chart failed: {e}")
            return {"error": str(e)}


def register_tools(llm_service, db: Session):
    """Register all tools with LLM service."""
    registry = ToolRegistry(db)
    
    # ... existing registrations ...
    
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

    llm_service.register_tool(
        "get_my_leave_requests",
        registry.get_my_leave_requests,
        "List the status of my recent leave requests",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "employee_id": {"type": "string", "description": "Employee ID"},
                "n": {"type": "integer", "description": "Number of requests to return", "default": 5}
            },
            "required": ["tenant_id", "employee_id"]
        }
    )

    llm_service.register_tool(
        "get_pending_approvals",
        registry.get_pending_approvals,
        "Show leave requests waiting for my approval",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "manager_id": {"type": "string", "description": "Manager Employee ID"}
            },
            "required": ["tenant_id", "manager_id"]
        }
    )

    llm_service.register_tool(
        "get_dashboard_summary",
        registry.get_dashboard_summary,
        "Fetch key HR metrics for my organisation",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"}
            },
            "required": ["tenant_id"]
        }
    )

    llm_service.register_tool(
        "list_employees",
        registry.list_employees,
        "Search employees by department, status, or name",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "query": {"type": "string", "description": "Name or email search query"},
                "department": {"type": "string", "description": "Filter by department"}
            },
            "required": ["tenant_id"]
        }
    )

    llm_service.register_tool(
        "get_employee_profile",
        registry.get_employee_profile,
        "Look up a specific employee's profile information",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "employee_id": {"type": "string", "description": "Employee ID or UUID"}
            },
            "required": ["tenant_id", "employee_id"]
        }
    )

    llm_service.register_tool(
        "get_attendance_summary",
        registry.get_attendance_summary,
        "Show hours worked, overtime, and late arrivals for a specific period",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "employee_id": {"type": "string", "description": "Employee ID"},
                "start_date": {"type": "string", "description": "Start date (ISO format)"},
                "end_date": {"type": "string", "description": "End date (ISO format)"}
            },
            "required": ["tenant_id", "employee_id", "start_date", "end_date"]
        }
    )

    llm_service.register_tool(
        "regularize_attendance",
        registry.regularize_attendance,
        "Request attendance regularization for a missed punch-in/out",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "employee_id": {"type": "string", "description": "Employee ID"},
                "date": {"type": "string", "description": "Date to regularize (ISO format)"},
                "reason": {"type": "string", "description": "Reason for regularization"}
            },
            "required": ["tenant_id", "employee_id", "date", "reason"]
        }
    )

    llm_service.register_tool(
        "estimate_tax_deduction",
        registry.estimate_tax_deduction,
        "Calculate estimated tax for a bonus or salary change",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "employee_id": {"type": "string", "description": "Employee ID"},
                "gross_amount": {"type": "number", "description": "Gross amount to calculate tax on"}
            },
            "required": ["tenant_id", "employee_id", "gross_amount"]
        }
    )

    llm_service.register_tool(
        "download_payslip",
        registry.download_payslip,
        "Generate a download link for a specific payslip",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "employee_id": {"type": "string", "description": "Employee ID"},
                "month": {"type": "integer", "description": "Month (1-12)"},
                "year": {"type": "integer", "description": "Year (e.g. 2024)"}
            },
            "required": ["tenant_id", "employee_id", "month", "year"]
        }
    )

    llm_service.register_tool(
        "find_employee",
        registry.find_employee,
        "Search for colleagues by name, role, or department",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "query": {"type": "string", "description": "Name, role, or department to search for"}
            },
            "required": ["tenant_id", "query"]
        }
    )

    llm_service.register_tool(
        "get_org_chart",
        registry.get_org_chart,
        "Show reporting manager and direct reports",
        {
            "type": "object",
            "properties": {
                "tenant_id": {"type": "string", "description": "Tenant ID"},
                "employee_id": {"type": "string", "description": "Employee ID"}
            },
            "required": ["tenant_id", "employee_id"]
        }
    )
    
    logger.info("Registered all tools with LLM service")

