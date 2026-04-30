"""
Dependency Resolver

Handles task dependencies and ordering constraints.
"""

from typing import List, Dict, Set, Optional
import structlog

from app.models import PlannedTask

logger = structlog.get_logger()


class CircularDependencyError(Exception):
    """Raised when circular dependencies are detected"""
    pass


def validate_dependencies(tasks: List[PlannedTask]) -> Dict[str, List[str]]:
    """
    Validate task dependencies.
    
    Returns:
        Dict mapping task_id -> list of error messages
    """
    errors = {}
    task_ids = {t.task_id for t in tasks if t.task_id}
    
    for task in tasks:
        task_errors = []
        
        if not task.depends_on:
            continue
        
        # Check if all dependency IDs exist
        for dep_id in task.depends_on:
            if dep_id not in task_ids:
                task_errors.append(f"Dependency '{dep_id}' does not exist")
        
        if task_errors:
            errors[task.task_id] = task_errors
    
    # Check for circular dependencies
    try:
        topological_sort(tasks)
    except CircularDependencyError as e:
        errors["_circular"] = [str(e)]
    
    return errors


def topological_sort(tasks: List[PlannedTask]) -> List[PlannedTask]:
    """
    Sort tasks respecting dependencies using topological sort.
    
    Tasks without dependencies come first.
    Dependent tasks come after their prerequisites.
    
    Raises:
        CircularDependencyError if circular dependencies detected
    """
    if not tasks:
        return []
    
    # Build adjacency list and in-degree count
    task_map = {t.task_id: t for t in tasks if t.task_id}
    in_degree = {t.task_id: 0 for t in tasks if t.task_id}
    adjacency = {t.task_id: [] for t in tasks if t.task_id}
    
    # Tasks without IDs go first
    tasks_without_ids = [t for t in tasks if not t.task_id]
    
    for task in tasks:
        if not task.task_id or not task.depends_on:
            continue
        
        for dep_id in task.depends_on:
            if dep_id in adjacency:
                adjacency[dep_id].append(task.task_id)
                in_degree[task.task_id] += 1
    
    # Kahn's algorithm for topological sort
    queue = [tid for tid, degree in in_degree.items() if degree == 0]
    sorted_ids = []
    
    while queue:
        current_id = queue.pop(0)
        sorted_ids.append(current_id)
        
        # Reduce in-degree for neighbors
        for neighbor_id in adjacency.get(current_id, []):
            in_degree[neighbor_id] -= 1
            if in_degree[neighbor_id] == 0:
                queue.append(neighbor_id)
    
    # Check if all nodes were processed
    if len(sorted_ids) != len(task_map):
        # Circular dependency detected
        unprocessed = [tid for tid in in_degree if in_degree[tid] > 0]
        raise CircularDependencyError(
            f"Circular dependency detected involving tasks: {', '.join(unprocessed)}"
        )
    
    # Convert back to task objects
    sorted_tasks = tasks_without_ids + [task_map[tid] for tid in sorted_ids]
    
    logger.info("Tasks sorted by dependencies",
               total_count=len(sorted_tasks),
               dependent_count=len([t for t in tasks if t.depends_on]))
    
    return sorted_tasks
