"""Shared slowapi rate limiter.

Defined in its own module so route modules can attach ``@limiter.limit(...)``
decorators without importing ``app.main`` (which would create an import cycle).
``main`` wires this limiter into the app via ``app.state.limiter`` and registers
the 429 handler.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _client_ip(request: Request) -> str:
    """Rate-limit key: the real client IP.

    The API runs behind the nginx reverse proxy, which forwards the original
    client address in ``X-Forwarded-For``. Without this, ``request.client.host``
    would be the proxy's IP and every user would share one bucket.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_ip)
