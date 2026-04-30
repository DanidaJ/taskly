"""
Commitment Validator

Validates commitments for conflicts and overlaps.
"""

from typing import List, Dict, Optional
from datetime import datetime, time
import structlog

from app.models import Commitment, CommitmentCreate

logger = structlog.get_logger()


def parse_time(time_str: str) -> time:
    """Parse time string to time object"""
    parts = time_str.split(":")
    return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)


def times_overlap(start1: time, end1: time, start2: time, end2: time) -> bool:
    """Check if two time ranges overlap"""
    # Convert to minutes for easier comparison
    start1_min = start1.hour * 60 + start1.minute
    end1_min = end1.hour * 60 + end1.minute
    start2_min = start2.hour * 60 + start2.minute
    end2_min = end2.hour * 60 + end2.minute
    
    # Handle cross-midnight scenarios
    if end1_min < start1_min:  # First range crosses midnight
        end1_min += 24 * 60
    if end2_min < start2_min:  # Second range crosses midnight
        end2_min += 24 * 60
    
    # Check overlap
    return not (end1_min <= start2_min or end2_min <= start1_min)


def find_overlapping_commitments(commitments: List[Commitment]) -> List[Dict]:
    """
    Find all pairs of overlapping commitments.
    
    Returns:
        List of dicts with 'commitment1', 'commitment2', and 'conflict_days'
    """
    conflicts = []
    
    for i, c1 in enumerate(commitments):
        for c2 in commitments[i+1:]:
            # Check if they share any days
            shared_days = set(c1.days_of_week) & set(c2.days_of_week)
            
            if not shared_days:
                continue
            
            # Check if times overlap
            start1 = parse_time(c1.start_time)
            end1 = parse_time(c1.end_time)
            start2 = parse_time(c2.start_time)
            end2 = parse_time(c2.end_time)
            
            if times_overlap(start1, end1, start2, end2):
                conflicts.append({
                    "commitment1": {
                        "id": c1.id if hasattr(c1, 'id') else None,
                        "name": c1.name,
                        "time": f"{c1.start_time}-{c1.end_time}"
                    },
                    "commitment2": {
                        "id": c2.id if hasattr(c2, 'id') else None,
                        "name": c2.name,
                        "time": f"{c2.start_time}-{c2.end_time}"
                    },
                    "conflict_days": list(shared_days)
                })
                
                logger.warning("Commitment conflict detected",
                              c1=c1.name,
                              c2=c2.name,
                              days=list(shared_days))
    
    return conflicts


class ValidationResult:
    """Result of commitment validation"""
    def __init__(self, is_valid: bool, error_message: Optional[str] = None, conflicts: Optional[List[Dict]] = None):
        self.is_valid = is_valid
        self.error_message = error_message
        self.conflicts = conflicts or []


def validate_new_commitment(
    new_commitment: CommitmentCreate,
    existing_commitments: List[Commitment]
) -> ValidationResult:
    """
    Validate a new commitment against existing ones.
    
    Returns:
        ValidationResult with is_valid flag and error details
    """
    # Basic validation
    start = parse_time(new_commitment.start_time)
    end = parse_time(new_commitment.end_time)
    
    # Check for conflicts with existing commitments
    conflicts = []
    
    for existing in existing_commitments:
        # Check if they share any days
        shared_days = set(new_commitment.days_of_week) & set(existing.days_of_week)
        
        if not shared_days:
            continue
        
        # Check if times overlap
        exist_start = parse_time(existing.start_time)
        exist_end = parse_time(existing.end_time)
        
        if times_overlap(start, end, exist_start, exist_end):
            conflicts.append({
                "name": existing.name,
                "time": f"{existing.start_time}-{existing.end_time}",
                "days": list(shared_days)
            })
    
    if conflicts:
        day_names = {0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat"}
        conflict_details = []
        for c in conflicts:
            days_str = ", ".join([day_names[d] for d in c["days"]])
            conflict_details.append(f"{c['name']} ({c['time']}) on {days_str}")
        
        error_msg = f"Commitment overlaps with: {'; '.join(conflict_details)}"
        
        logger.warning("New commitment validation failed",
                      new_commitment=new_commitment.name,
                      conflicts=conflicts)
        
        return ValidationResult(
            is_valid=False,
            error_message=error_msg,
            conflicts=conflicts
        )
    
    logger.info("New commitment validated successfully",
               commitment=new_commitment.name)
    
    return ValidationResult(is_valid=True)
