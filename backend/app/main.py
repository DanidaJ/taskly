"""
Taskly Backend API
AI-Powered Personal Planner with Energy-Aware Scheduling
"""
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.core.config import settings
from app.api import (
    ai_router,
    task_router,
    plan_router,
    notification_router,
    profile_router,
    data_router,
    recurring_router,
    backlog_router,
    project_router,
)

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    logger.info("Starting Taskly API", version=settings.APP_VERSION)
    stop_scheduler = None
    try:
        from app.services.notification_service import initialize_firebase
        from app.services.notification_scheduler import (
            start_scheduler,
            stop_scheduler as _stop,
        )
        initialize_firebase()
        start_scheduler()
        stop_scheduler = _stop
    except Exception as e:
        logger.warning("notification scheduler startup failed", error=str(e))
    yield
    if stop_scheduler:
        try:
            stop_scheduler()
        except Exception:
            pass
    logger.info("Shutting down Taskly API")


# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
    Taskly - AI-Powered Personal Planner API
    
    An intelligent personal planner that creates energy-aware, sleep-friendly 
    daily schedules to maximize productivity, motivation, and focus.
    
    Features:
    - AI-powered task planning with Mistral
    - Energy pattern optimization
    - Sleep schedule protection
    - Smart break suggestions
    - Push notifications via Firebase
    """,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors"""
    logger.warning(
        "Validation error",
        path=request.url.path,
        errors=exc.errors(),
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation error",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected errors"""
    logger.error(
        "Unexpected error",
        path=request.url.path,
        error=str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred"},
    )


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests"""
    logger.info(
        "Request received",
        method=request.method,
        path=request.url.path,
    )
    response = await call_next(request)
    logger.info(
        "Request completed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
    )
    return response


# Include routers
app.include_router(ai_router, prefix="/api/v1")
app.include_router(task_router, prefix="/api/v1")
app.include_router(plan_router, prefix="/api/v1")
app.include_router(notification_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
app.include_router(data_router, prefix="/api/v1")
app.include_router(recurring_router, prefix="/api/v1")
app.include_router(backlog_router, prefix="/api/v1")
app.include_router(project_router, prefix="/api/v1")


# Health check endpoints
@app.get("/health", tags=["Health"])
async def health_check():
    """Basic health check"""
    return {"status": "healthy", "version": settings.APP_VERSION}


@app.get("/api/v1/health", tags=["Health"])
async def api_health_check():
    """API health check with more details"""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "app_name": settings.APP_NAME,
        "debug": settings.DEBUG,
    }


# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to Taskly API",
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.DEBUG else "Documentation disabled in production",
    }
