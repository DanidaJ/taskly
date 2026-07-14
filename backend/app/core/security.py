import asyncio
import time

import httpx
from jose import JWTError, jwt
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
import structlog

logger = structlog.get_logger()

security = HTTPBearer()
# Optional Bearer security - doesn't fail if no token provided
optional_security = HTTPBearer(auto_error=False)

# Supabase signs user access tokens with asymmetric JWT signing keys (ES256/RS256)
# and publishes the matching *public* keys at this JWKS endpoint. We verify tokens
# against those public keys, so no shared secret is stored or trusted server-side.
_JWKS_URL = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
_JWKS_TTL_SECONDS = 3600  # re-fetch the key set at most once an hour
_ALLOWED_ALGORITHMS = ["ES256", "RS256"]

_jwks_lock = asyncio.Lock()
_jwks_by_kid: dict[str, dict] = {}
_jwks_fetched_at: float = 0.0


async def _refresh_jwks() -> None:
    """Fetch and cache the project's public signing keys, indexed by ``kid``."""
    global _jwks_by_kid, _jwks_fetched_at
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(_JWKS_URL)
    resp.raise_for_status()
    keys = resp.json().get("keys", [])
    _jwks_by_kid = {k["kid"]: k for k in keys if k.get("kid")}
    _jwks_fetched_at = time.monotonic()


async def _get_signing_key(kid: str) -> dict | None:
    """Return the JWK for ``kid``, refreshing the cache when missing or stale.

    The refresh is guarded by a lock so a burst of requests with an unknown kid
    (e.g. right after Supabase rotates keys) triggers a single network fetch.
    """
    stale = (time.monotonic() - _jwks_fetched_at) > _JWKS_TTL_SECONDS
    if kid in _jwks_by_kid and not stale:
        return _jwks_by_kid[kid]
    async with _jwks_lock:
        # Re-check inside the lock: another coroutine may have just refreshed.
        stale = (time.monotonic() - _jwks_fetched_at) > _JWKS_TTL_SECONDS
        if kid not in _jwks_by_kid or stale:
            await _refresh_jwks()
    return _jwks_by_kid.get(kid)


async def warm_jwks_cache() -> None:
    """Best-effort prefetch of the JWKS, called once at application startup."""
    async with _jwks_lock:
        await _refresh_jwks()


async def _decode_supabase_token(token: str) -> dict:
    """Verify a Supabase access token against the project's public JWKS.

    Checks the asymmetric signature (ES256/RS256), the expiry (``exp``), and the
    audience (``aud`` must be ``authenticated``). Raises ``jose.JWTError`` on any
    validation failure. There is no unsigned-decode fallback.
    """
    kid = jwt.get_unverified_header(token).get("kid")
    if not kid:
        raise JWTError("token header missing 'kid'")
    jwk = await _get_signing_key(kid)
    if jwk is None:
        raise JWTError(f"no matching JWKS key for kid={kid}")
    return jwt.decode(
        token,
        jwk,
        algorithms=_ALLOWED_ALGORITHMS,
        audience="authenticated",
    )


def _user_from_payload(payload: dict) -> dict | None:
    user_id = payload.get("sub")
    if not user_id:
        return None
    return {
        "user_id": user_id,
        "email": payload.get("email"),
        "role": payload.get("role", "authenticated"),
    }


async def validate_supabase_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Required auth dependency.

    Returns the authenticated user only when the Supabase JWT verifies against
    the public JWKS (signature + exp + aud). Responds 401 for an invalid token,
    503 if the key set cannot be reached.
    """
    try:
        payload = await _decode_supabase_token(credentials.credentials)
    except JWTError as exc:
        logger.warning("token_validation_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as exc:  # JWKS fetch / network failure
        logger.error("jwks_unavailable", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication temporarily unavailable",
        )

    user = _user_from_payload(payload)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security),
) -> dict | None:
    """Optional auth dependency.

    Returns the verified user when a valid Supabase token is supplied, or
    ``None`` when the token is absent, invalid, or unverifiable. Never trusts an
    unverified token and never falls back to a demo user.
    """
    if credentials is None:
        return None
    try:
        payload = await _decode_supabase_token(credentials.credentials)
    except JWTError:
        return None
    except Exception as exc:  # JWKS unavailable -> treat request as anonymous
        logger.warning("jwks_unavailable_optional", error=str(exc))
        return None

    return _user_from_payload(payload)
