import secrets
from typing import Optional
from fastapi import Header, HTTPException, status
from config import settings

def verify_service_authorization(
    x_service_authorization: Optional[str] = Header(None, alias="X-Service-Authorization"),
) -> bool:
    """
    Authenticate inbound requests using dedicated X-Service-Authorization: Bearer <secret>.
    Reuses existing AI_BACKEND_SECRET configured for Express M2M communication.
    Fails closed on missing, malformed, or invalid tokens with HTTP 401.
    """
    if not x_service_authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing machine authorization credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = x_service_authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authorization header. Expected 'Bearer <secret>'.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1].strip()
    expected_secret = settings.AI_BACKEND_SECRET or ""
    if not expected_secret or not secrets.compare_digest(token, expected_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid machine service credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return True
