from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
import structlog

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return encoded_jwt


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Dependency to get the current authenticated user from JWT token.
    Supports both custom JWT and Supabase JWT tokens.
    """
    token = credentials.credentials
    logger = structlog.get_logger()
    
    # Try custom JWT validation first (our own tokens)
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id:
            return {
                "user_id": user_id,
                "email": payload.get("email"),
                "role": payload.get("role", "authenticated")
            }
    except Exception:
        pass  # Fall through to try Supabase token
    
    # Try Supabase token (decode without signature verification for now)
    # In production, you should validate with Supabase JWT secret
    try:
        payload = jwt.decode(
            token,
            key="",
            options={
                "verify_signature": False, 
                "verify_exp": False,
                "verify_aud": False
            }
        )
        user_id = payload.get("sub")
        if user_id:
            return {
                "user_id": user_id,
                "email": payload.get("email"),
                "role": payload.get("role", "authenticated")
            }
    except Exception as e:
        logger.warning("Token validation failed", error=str(e))
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


# Alternative: Validate Supabase JWT tokens
async def validate_supabase_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Validate Supabase JWT token.
    """
    try:
        token = credentials.credentials
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated"
        )
        return {
            "user_id": payload.get("sub"),
            "email": payload.get("email"),
            "role": payload.get("role")
        }
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


# Optional Bearer security - doesn't fail if no token provided
optional_security = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security)
) -> dict | None:
    """
    Optional dependency to get the current user. Returns None if no token or invalid token.
    Useful for endpoints that can work without authentication.
    """
    if credentials is None:
        return None
    
    try:
        token = credentials.credentials
        
        # First try to validate as Supabase token
        if settings.supabase_jwt_secret:
            try:
                payload = jwt.decode(
                    token,
                    settings.supabase_jwt_secret,
                    algorithms=["HS256"],
                    audience="authenticated"
                )
                return {
                    "user_id": payload.get("sub"),
                    "email": payload.get("email"),
                    "role": payload.get("role")
                }
            except JWTError:
                pass
        
        # In debug mode, decode token without verification
        if settings.DEBUG:
            try:
                payload = jwt.decode(token, options={"verify_signature": False})
                user_id = payload.get("sub")
                if user_id:
                    return {
                        "user_id": user_id,
                        "email": payload.get("email"),
                        "role": payload.get("role", "authenticated")
                    }
            except JWTError:
                pass
            # If token decoding fails in debug mode, return demo user
            return {"user_id": "demo-user", "email": "demo@example.com", "role": "authenticated"}
        
        # Try custom JWT
        payload = decode_token(token)
        user_id = payload.get("sub")
        if user_id:
            return {"user_id": user_id, "email": payload.get("email")}
        return None
    except Exception:
        if settings.DEBUG:
            return {"user_id": "demo-user", "email": "demo@example.com", "role": "authenticated"}
        return None
