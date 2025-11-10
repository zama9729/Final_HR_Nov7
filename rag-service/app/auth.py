"""JWT authentication and RBAC."""
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from jose import JWTError, jwt
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import Employee, Tenant
import uuid
import logging

logger = logging.getLogger(__name__)


security = HTTPBearer()


class RBACPolicy:
    """Role-Based Access Control policy."""
    
    # Define permissions for each role
    PERMISSIONS = {
        "employee": {
            "query": True,
            "get_leave_balance": True,  # Own balance only
            "list_recent_paystubs": True,  # Own paystubs only
            "create_leave_request": True,
            "approve_leave": False,
            "summarize_policy": True,
        },
        "manager": {
            "query": True,
            "get_leave_balance": True,  # Team members
            "list_recent_paystubs": False,
            "create_leave_request": True,
            "approve_leave": True,  # Team members only
            "summarize_policy": True,
        },
        "hr": {
            "query": True,
            "get_leave_balance": True,  # All employees
            "list_recent_paystubs": False,
            "create_leave_request": True,
            "approve_leave": True,  # All employees
            "summarize_policy": True,
        },
        "ceo": {
            "query": True,
            "get_leave_balance": True,
            "list_recent_paystubs": False,
            "create_leave_request": True,
            "approve_leave": True,  # All employees
            "summarize_policy": True,
        },
    }
    
    @classmethod
    def has_permission(cls, role: str, action: str) -> bool:
        """Check if role has permission for action."""
        role_perms = cls.PERMISSIONS.get(role.lower(), {})
        return role_perms.get(action, False)
    
    @classmethod
    def can_access_employee_data(cls, role: str, requester_id: uuid.UUID, target_employee_id: uuid.UUID) -> bool:
        """Check if requester can access target employee's data."""
        role_lower = role.lower()
        
        # Employees can only access their own data
        if role_lower == "employee":
            return requester_id == target_employee_id
        
        # Managers, HR, CEO can access all
        return role_lower in ["manager", "hr", "ceo"]


def create_access_token(data: Dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=settings.jwt_expiration_hours)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return encoded_jwt


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    """Verify JWT token and return payload."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


class TenantMiddleware:
    """Middleware to extract and validate tenant context."""
    
    @staticmethod
    def get_tenant_from_token(payload: Dict, db: Session) -> Tenant:
        """Get tenant from JWT payload."""
        # Support both 'tenant_id' and 'org_id' (HR app uses org_id)
        tenant_id = payload.get("tenant_id") or payload.get("org_id")
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant ID (tenant_id or org_id) missing from token"
            )
        
        tenant = db.query(Tenant).filter(Tenant.id == uuid.UUID(tenant_id)).first()
        if not tenant:
            # Auto-create tenant if it doesn't exist (for HR app compatibility)
            try:
                org_name = payload.get("org_name") or payload.get("organization_name") or f"Organization {tenant_id[:8]}"
                # Generate a unique domain from tenant ID (domain must be unique)
                domain = f"tenant-{str(tenant_id).replace('-', '')[:16]}.local"
                new_tenant = Tenant(
                    id=uuid.UUID(tenant_id),
                    name=org_name,
                    domain=domain,
                    is_active=True
                )
                db.add(new_tenant)
                db.commit()
                db.refresh(new_tenant)
                logger.info(f"Auto-created tenant {tenant_id} from JWT token")
                return new_tenant
            except Exception as e:
                logger.error(f"Failed to auto-create tenant: {e}", exc_info=True)
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Tenant {tenant_id} not found and auto-creation failed: {str(e)}"
                )
        if not tenant.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant is inactive"
            )
        return tenant
    
    @staticmethod
    def get_user_from_token(payload: Dict, db: Session, tenant: Tenant) -> Employee:
        """Get user from JWT payload."""
        # Support multiple token formats: 'sub', 'user_id', or 'id' (HR app uses 'id')
        user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User ID (sub, user_id, or id) missing from token"
            )
        
        user = db.query(Employee).filter(
            Employee.id == uuid.UUID(user_id),
            Employee.tenant_id == tenant.id,
            Employee.is_active == True
        ).first()
        
        if not user:
            # If user doesn't exist in RAG DB, try to create a basic record from token
            # This allows HR app users to use RAG without pre-seeding
            try:
                email = payload.get("email", "")
                role = payload.get("role", "employee")
                first_name = payload.get("first_name") or payload.get("firstName", "")
                last_name = payload.get("last_name") or payload.get("lastName", "")
                # Generate employee_id from user UUID (required field)
                employee_id_str = str(user_id).replace('-', '')[:16] if user_id else str(uuid.uuid4()).replace('-', '')[:16]
                
                new_user = Employee(
                    id=uuid.UUID(user_id),
                    tenant_id=tenant.id,
                    employee_id=employee_id_str,
                    email=email,
                    role=role,
                    first_name=first_name,
                    last_name=last_name,
                    is_active=True
                )
                db.add(new_user)
                db.commit()
                db.refresh(new_user)
                return new_user
            except Exception as e:
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to auto-create user from token: {e}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User not found in RAG database and auto-creation failed"
                )
        return user


def get_current_user(
    payload: Dict = Depends(verify_token),
    db: Session = Depends(get_db)
) -> Employee:
    """Dependency to get current authenticated user."""
    tenant_middleware = TenantMiddleware()
    tenant = tenant_middleware.get_tenant_from_token(payload, db)
    user = tenant_middleware.get_user_from_token(payload, db, tenant)
    return user


def get_current_tenant(
    payload: Dict = Depends(verify_token),
    db: Session = Depends(get_db)
) -> Tenant:
    """Dependency to get current tenant."""
    tenant_middleware = TenantMiddleware()
    return tenant_middleware.get_tenant_from_token(payload, db)


def require_permission(action: str):
    """Decorator factory for permission checks."""
    def permission_checker(
        user: Employee = Depends(get_current_user)
    ) -> Employee:
        if not RBACPolicy.has_permission(user.role, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {action} requires appropriate role"
            )
        return user
    return permission_checker

