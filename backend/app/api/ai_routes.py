from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.core.security import get_optional_user
from app.core.rate_limit import limiter
from app.services import ai_service
from app.models import (
    AIPlanRequest,
    AIPlanResponse,
    AIPlanUpdateRequest,
    AIReflectionRequest,
    AIReflectionResponse,
    AIClassifyRequest,
    AITaskClassification,
)

router = APIRouter(prefix="/ai", tags=["AI Planning"])


@router.post("/plan", response_model=AIPlanResponse)
@limiter.limit("10/minute")
async def generate_plan(
    request: Request,
    payload: AIPlanRequest,
    current_user: dict | None = Depends(get_optional_user),
):
    """
    Generate an AI-powered plan from raw task input.

    The AI will:
    - Parse and classify tasks by cognitive load, effort, and flexibility
    - Create an optimized schedule respecting energy patterns and sleep
    - Provide recommendations for productivity
    """
    try:
        return await ai_service.generate_plan(payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate plan: {str(e)}",
        )


@router.post("/plan/update", response_model=AIPlanResponse)
@limiter.limit("10/minute")
async def update_plan(
    request: Request,
    payload: AIPlanUpdateRequest,
    current_user: dict | None = Depends(get_optional_user),
):
    """
    Update an existing plan based on user modifications.
    """
    try:
        return await ai_service.update_plan(payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update plan: {str(e)}",
        )


@router.post("/reflection", response_model=AIReflectionResponse)
@limiter.limit("10/minute")
async def get_reflection(
    request: Request,
    payload: AIReflectionRequest,
    current_user: dict | None = Depends(get_optional_user),
):
    """
    Generate end-of-day reflection prompts and suggestions.
    """
    try:
        return await ai_service.get_reflection(payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate reflection: {str(e)}",
        )


@router.post("/classify", response_model=AITaskClassification)
@limiter.limit("10/minute")
async def classify_task(
    request: Request,
    payload: AIClassifyRequest,
    current_user: dict | None = Depends(get_optional_user),
):
    """
    Classify a single task based on its description.

    Returns:
    - Cleaned task name
    - Cognitive load type
    - Estimated effort (1-5)
    - Flexibility (fixed/flexible)
    """
    try:
        return await ai_service.classify_task(payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to classify task: {str(e)}",
        )
