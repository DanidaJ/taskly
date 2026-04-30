import json
import structlog
from typing import Optional
from mistralai import Mistral
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings
from app.models import (
    AIPlanResponse,
    AIPlanRequest,
    AIPlanUpdateRequest,
    AIReflectionRequest,
    AIReflectionResponse,
    AIClassifyRequest,
    AITaskClassification,
    UserContext,
    CognitiveLoad,
    TaskFlexibility,
    Priority,
    PlannedTask,
)

logger = structlog.get_logger()

# Note: The system prompt is now configured in the Mistral Agent console
# This is kept here for reference and fallback scenarios
SYSTEM_PROMPT_REFERENCE = """
The AI agent is configured in console.mistral.ai with these capabilities:
- Parse raw natural language task input
- Classify tasks by cognitive load, effort, and flexibility
- Generate energy-aware daily plans
- Respect sleep schedules and commitments
- Output structured JSON responses
"""

# Fallback system prompt when using chat API directly
PLANNING_SYSTEM_PROMPT = """You are an intelligent daily planning assistant. Your job is to help users create optimized daily schedules.

CRITICAL RULES:
1. PARSE INDIVIDUAL TASKS: When users list multiple activities (e.g., "do X, Y, and Z"), break them into SEPARATE tasks. Never create one task with the entire sentence.
2. When the user mentions something that matches an EXISTING COMMITMENT in their context (like work hours), DO NOT create a new task for it. The commitment is already scheduled.
3. Only create tasks for NEW activities that need to be planned around existing commitments.
4. Estimate realistic durations based on task type:
   - Quick tasks (emails, calls): 15-30 minutes
   - Personal projects: 1-3 hours per session
   - Physical activities: 30-60 minutes
   - Family time: 1-2 hours
   - Deep focus work: 1-4 hours
   - Research: 30-90 minutes
   - Content creation (reels, posts): 20-45 minutes
5. Set priority based on importance:
   - HIGH: Deadlines, health, urgent work
   - MEDIUM: Regular tasks, personal projects
   - LOW: Optional, leisure activities
6. Classify cognitive type accurately:
   - deep_focus: Complex problem-solving, coding, writing
   - light_focus: Emails, routine work, planning, research
   - admin: Scheduling, organizing, paperwork
   - physical: Exercise, sports, manual tasks
   - recovery: Breaks, meals, family time, relaxation

Always respond with valid JSON in the requested format."""


def _convert_existing_tasks(raw_tasks: list) -> list:
    """Convert raw task dicts/objects from existing_plans into PlannedTask objects
    that the schedule service can use to block time slots."""
    converted = []
    for task in raw_tasks:
        try:
            if isinstance(task, dict):
                t_start = task.get('scheduled_start')
                t_end = task.get('scheduled_end')
                if not t_start or not t_end:
                    continue
                pt = PlannedTask(
                    id=task.get('id', f'existing-{len(converted)}'),
                    task_id=task.get('task_id', ''),
                    task_name=task.get('task_name', 'Existing task'),
                    suggested_duration=task.get('suggested_duration', '30 minutes'),
                    priority=task.get('priority', 'medium'),
                    order=task.get('order', 0),
                    status=task.get('status', 'pending'),
                    notes=task.get('notes'),
                    scheduled_start=t_start,
                    scheduled_end=t_end,
                )
                converted.append(pt)
            elif hasattr(task, 'scheduled_start') and task.scheduled_start:
                converted.append(task)
        except Exception as e:
            logger.warning(f"Could not convert existing task: {e}")
            continue
    return converted


def build_user_prompt(request: AIPlanRequest) -> str:
    """Build the user prompt from the request data"""
    from app.services.schedule_service import schedule_service
    from datetime import datetime
    
    context = request.user_context
    now = datetime.now()
    
    logger.info("Building user prompt", 
                target_date=request.target_date,
                commitment_count=len(context.commitments))
    
    # Calculate day of week for the target date
    target_dt = datetime.strptime(request.target_date, '%Y-%m-%d')
    day_of_week = (target_dt.weekday() + 1) % 7  # 0=Sunday
    day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    
    # Filter commitments for this specific day
    todays_commitments = [
        c for c in context.commitments 
        if day_of_week in c.days_of_week
    ]
    
    # Format commitments
    commitments_str = "\n".join([
        f"  🚫 {c.name}: {c.start_time} - {c.end_time} (BLOCKED - cannot schedule during this time)"
        for c in todays_commitments
    ]) if todays_commitments else "  No commitments today"
    
    # Extract existing tasks for this date (so AI knows what's already scheduled)
    existing_task_objects = []
    existing_tasks_str = ""
    if context.existing_plans:
        for plan in context.existing_plans:
            plan_tasks = plan.get('tasks') if isinstance(plan, dict) else getattr(plan, 'tasks', None)
            if plan_tasks:
                for task in plan_tasks:
                    t_name = task.get('task_name', '') if isinstance(task, dict) else getattr(task, 'task_name', '')
                    t_start = task.get('scheduled_start') if isinstance(task, dict) else getattr(task, 'scheduled_start', None)
                    t_end = task.get('scheduled_end') if isinstance(task, dict) else getattr(task, 'scheduled_end', None)
                    t_status = task.get('status', 'pending') if isinstance(task, dict) else getattr(task, 'status', 'pending')
                    t_dur = task.get('suggested_duration', '') if isinstance(task, dict) else getattr(task, 'suggested_duration', '')
                    if t_start and t_end:
                        existing_task_objects.append(task)
                        existing_tasks_str += f"  📌 {t_name}: {t_start} - {t_end} ({t_dur}, {t_status})\n"
    
    if not existing_tasks_str:
        existing_tasks_str = "  No tasks scheduled yet for this date."
    
    logger.info("Existing tasks for AI awareness", count=len(existing_task_objects))
    
    # Calculate available time slots (also considering existing tasks)
    # Convert existing tasks to PlannedTask objects for slot calculation
    existing_planned_tasks = _convert_existing_tasks(existing_task_objects)
    
    available_slots = schedule_service.get_available_time_slots(
        request.target_date,
        context.commitments,
        context.sleep_schedule,
        existing_tasks=existing_planned_tasks if existing_planned_tasks else None
    )
    
    # Calculate total available hours
    total_available_minutes = sum(
        int((slot[1] - slot[0]).total_seconds() // 60) 
        for slot in available_slots
    )
    total_available_hours = total_available_minutes / 60
    
    logger.info("Available time slots calculated", 
                slot_count=len(available_slots),
                total_hours=round(total_available_hours, 1))
    
    # Format available slots
    slots_str = "\n".join([
        f"  ✅ {slot[0].strftime('%H:%M')} to {slot[1].strftime('%H:%M')} ({int((slot[1] - slot[0]).total_seconds() // 60)} minutes available)"
        for slot in available_slots
    ]) if available_slots else "  ⚠️ No available time slots!"
    
    # Get preference value (handle both enum and string)
    energy_pref = context.energy_profile.preference
    if hasattr(energy_pref, 'value'):
        energy_pref = energy_pref.value
    
    # Detect if this is a night owl schedule
    is_night_owl = schedule_service.is_cross_midnight_schedule(context.sleep_schedule)
    sleep_deadline = schedule_service.calculate_sleep_deadline(context.sleep_schedule, request.target_date)
    
    # Current time context
    is_today = request.target_date == now.strftime('%Y-%m-%d')
    time_context = f"⏰ Current time: {now.strftime('%H:%M')} - Schedule tasks after this time" if is_today else ""
    
    # Build smart schedule awareness
    schedule_awareness = f"""
📅 **{day_names[day_of_week]}, {request.target_date}**
{time_context}

**Already Scheduled Tasks (DO NOT recreate these, they are already on the calendar):**
{existing_tasks_str}

**Your Blocked Time (Commitments):**
{commitments_str}

**Your Available Time Slots (ONLY schedule NEW tasks in these windows):**
{slots_str}

**Total Available: {total_available_hours:.1f} hours**

**Your Profile:**
- Energy type: {energy_pref} person
- Peak focus hours: {context.energy_profile.peak_focus_start} - {context.energy_profile.peak_focus_end}
- Wake time: {context.sleep_schedule.wake_time}
- Wind-down starts: {sleep_deadline.strftime('%H:%M')}
- Target sleep time: {context.sleep_schedule.sleep_time}
{"- NOTE: You're a night owl! Tasks can be scheduled past midnight until wind-down time." if is_night_owl else ""}
"""
    
    from app.services.task_history_service import task_history_service
    
    try:
        user_id = "demo_user"
        insights = task_history_service.get_user_insights(user_id)
        
        if insights["total_tasks_tracked"] > 0:
            historical_context = f"""
**📊 Your Personal Patterns (Last 30 Days):**
- Tasks typically take **{insights['duration_multiplier']}x** estimated time
- Most productive: {', '.join(insights['peak_hours'])}
- Best for deep focus: {', '.join(insights['best_focus_times'])}
- Exercise preference: {insights['preferred_exercise_time']}
- Completion rate: {insights['completion_rate']}%

💡 Multiply duration estimates by {insights['duration_multiplier']} to match your actual pace.
"""
            schedule_awareness = schedule_awareness + "\n" + historical_context
            logger.info("✨ Historical insights added", multiplier=insights['duration_multiplier'])
    except Exception as e:
        logger.warning("Could not load historical insights", error=str(e))

    prompt = f"""**User's Task Request:**
{request.raw_tasks_input}

{schedule_awareness}

**CRITICAL SCHEDULING RULES:**

1. **RESPECT COMMITMENTS**: Tasks can ONLY be scheduled in the available time slots listed above. 
   NEVER schedule during blocked commitment times.

2. **SMART DURATION ESTIMATION**: 
   - "Complete" or "finish" a task = 30-60 minutes (user is continuing existing work)
   - "Build" or "create from scratch" = 2-4 hours (new work)
   - "Deploy" = 30-60 minutes (typically quick if prepared)
   - "Testing" = 1-2 hours
   - Shopping/errands = 30-60 minutes
   - Reading = 30-60 minutes
   
3. **FIT TASKS TO AVAILABLE TIME**: 
   Total task time must not exceed {total_available_hours:.1f} hours.
   If tasks don't fit, recommend prioritizing or splitting across days.

4. **PRIORITY ORDERING**:
   - HIGH: Deploy tasks, deadlines, urgent work → Schedule first in available slots
   - MEDIUM: Project work, routine tasks
   - LOW: Optional activities like shopping, reading → Schedule last or suggest different day

5. **SMART NOTES**:
   In the "notes" field, include the SPECIFIC time slot where the task should go.
   Example: "Schedule at 19:00-20:00 after work ends"

**OUTPUT FORMAT (JSON only):**
{{
  "tasks": [
    {{
      "name": "Task name",
      "type": "deep_focus|light_focus|admin|physical|recovery",
      "estimated_effort": 1-5,
      "flexibility": "fixed|flexible"
    }}
  ],
  "plan": [
    {{
      "task_name": "Task name", 
      "suggested_duration": "X minutes",
      "priority": "high|medium|low",
      "notes": "Schedule at HH:MM-HH:MM (specific time slot)"
    }}
  ],
  "recommendations": [
    "Actionable recommendation 1",
    "Actionable recommendation 2"
  ]
}}

**CRITICAL PARSING RULES:**
- User said: "{request.raw_tasks_input}"
- BREAK DOWN this input into INDIVIDUAL, SEPARATE tasks
- If input contains multiple activities (e.g., "do X, Y, and Z"), create SEPARATE tasks for X, Y, and Z
- Example: "work on app, do research, make reel" → 3 separate tasks
- DO NOT repeat the entire input as task names
- Give each task a clear, concise name (3-8 words max)
- Ignore metadata like "Historical patterns" or conversation context
- If user mentions their job/work hours, that's a commitment - don't create a task for it"""
    
    return prompt


class AIService:
    """Service for interacting with Mistral AI via custom agent"""
    
    def __init__(self):
        self.client: Optional[Mistral] = None
        self.agent_id = settings.mistral_agent_id
        
        if settings.mistral_api_key:
            self.client = Mistral(api_key=settings.mistral_api_key)
            logger.info("Mistral AI client initialized", agent_id=self.agent_id)
    
    def _ensure_client(self):
        if not self.client:
            raise ValueError("Mistral API key not configured")
        if not self.agent_id:
            raise ValueError("Mistral Agent ID not configured")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(Exception)
    )
    async def _call_agent(self, user_input: str) -> str:
        """Call Mistral AI using chat completions API with agent"""
        self._ensure_client()
        
        logger.info("Calling Mistral agent", agent_id=self.agent_id, input_length=len(user_input))
        
        try:
            # Use chat completions API with the agent_id
            response = self.client.agents.complete(
                agent_id=self.agent_id,
                messages=[
                    {"role": "user", "content": user_input}
                ]
            )
            
            # Extract the response text
            if hasattr(response, 'choices') and response.choices:
                result = response.choices[0].message.content
            elif hasattr(response, 'outputs') and response.outputs:
                result = response.outputs
            else:
                result = str(response)
            
            logger.info("Mistral agent response", response_preview=result[:200] if result else "empty")
            return result
        except AttributeError as e:
            logger.warning(f"agents.complete not available, trying chat.complete: {e}")
            # Fallback to regular chat API with system prompt
            response = self.client.chat.complete(
                model="mistral-small-latest",
                messages=[
                    {"role": "system", "content": PLANNING_SYSTEM_PROMPT},
                    {"role": "user", "content": user_input}
                ]
            )
            result = response.choices[0].message.content
            logger.info("Mistral chat response", response_preview=result[:200] if result else "empty")
            return result
        except Exception as e:
            # Prevent tenacity RetryError bubbles; return safe fallback JSON
            logger.error("Mistral call failed, returning fallback response", error=str(e), error_type=type(e).__name__)
            return '{"tasks": [], "plan": [], "recommendations": ["AI temporarily unavailable"]}'
    
    def _parse_json_response(self, response: str) -> dict:
        """Parse JSON from AI response, handling potential formatting issues"""
        # Remove markdown code blocks if present
        response = response.strip()
        if response.startswith("```json"):
            response = response[7:]
        if response.startswith("```"):
            response = response[3:]
        if response.endswith("```"):
            response = response[:-3]
        
        try:
            return json.loads(response.strip())
        except json.JSONDecodeError as e:
            logger.error("Failed to parse AI response", error=str(e), response=response[:500])
            raise ValueError(f"Invalid JSON response from AI: {str(e)}")
    
    async def generate_plan(self, request: AIPlanRequest) -> AIPlanResponse:
        """Generate an AI-powered plan from raw task input using custom agent"""
        # Build the user prompt with all context
        user_input = build_user_prompt(request)
        
        try:
            response_text = await self._call_agent(user_input)
            logger.info("AI response received", response_length=len(response_text) if response_text else 0)
            response_data = self._parse_json_response(response_text)
            
            # Extract tasks with proper validation
            tasks = []
            for t in response_data.get("tasks", []):
                task_type = t.get("type", "light_focus")
                # Normalize task type
                if task_type not in ["deep_focus", "light_focus", "admin", "physical", "recovery"]:
                    task_type = "light_focus"
                
                flexibility = t.get("flexibility", "flexible")
                if flexibility not in ["fixed", "flexible"]:
                    flexibility = "flexible"
                
                effort = t.get("estimated_effort", 3)
                if not isinstance(effort, int) or effort < 1 or effort > 5:
                    effort = 3
                
                tasks.append({
                    "name": t.get("name", "Unnamed task"),
                    "type": task_type,
                    "estimated_effort": effort,
                    "flexibility": flexibility,
                })
            
            # Extract plan with proper validation
            plan = []
            for p in response_data.get("plan", []):
                priority = p.get("priority", "medium")
                if priority not in ["high", "medium", "low"]:
                    priority = "medium"
                
                duration = p.get("suggested_duration", "30 minutes")
                # Ensure duration is a string
                if not isinstance(duration, str):
                    duration = f"{duration} minutes"
                
                plan.append({
                    "task_name": p.get("task_name", ""),
                    "suggested_duration": duration,
                    "priority": priority,
                    "notes": p.get("notes"),
                })
            
            # Apply schedule enforcement to ensure tasks don't conflict with commitments
            plan = self._enforce_schedule_constraints(
                plan, 
                request.target_date,
                request.user_context
            )
            
            # Note: scheduled_start and scheduled_end are already set by _enforce_schedule_constraints
            # Keep them in the response for the frontend to use directly
            
            # Validate and convert to Pydantic model
            result = AIPlanResponse(
                tasks=tasks,
                plan=plan,
                recommendations=response_data.get("recommendations", []),
            )
            logger.info("Plan generated successfully", task_count=len(tasks), plan_count=len(plan))
            return result
        except Exception as e:
            logger.error("Error generating plan", error=str(e), error_type=type(e).__name__)
            # Return a fallback response
            return self._generate_fallback_plan(request.raw_tasks_input)
    
    def _enforce_schedule_constraints(
        self, 
        plan_items: list,
        target_date: str,
        user_context: UserContext
    ) -> list:
        """Enforce schedule constraints using the schedule service"""
        from app.services.schedule_service import schedule_service
        import re
        
        try:
            logger.info("Enforcing schedule constraints", 
                       task_count=len(plan_items),
                       commitment_count=len(user_context.commitments),
                       target_date=target_date)
            
            # Convert plan items to PlannedTask objects for schedule enforcement
            planned_tasks = []
            for i, item in enumerate(plan_items):
                # Map priority string to Priority enum
                priority_map = {"high": Priority.HIGH, "medium": Priority.MEDIUM, "low": Priority.LOW}
                priority = priority_map.get(item.get("priority", "medium"), Priority.MEDIUM)
                
                # Extract time hint from notes if present (e.g., "Schedule at 20:00-22:00")
                scheduled_start = None
                scheduled_end = None
                notes = item.get("notes", "")
                if notes:
                    # Look for patterns like "20:00-22:00" or "at 20:00-22:00"
                    time_pattern = r'(?:at\s+)?(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})'
                    match = re.search(time_pattern, notes)
                    if match:
                        scheduled_start = match.group(1)
                        scheduled_end = match.group(2)
                        logger.info(f"🎯 Found fixed time hint for '{item['task_name']}': {scheduled_start}-{scheduled_end}")
                
                planned_task = PlannedTask(
                    id=f"temp-{i}",
                    task_id=f"task-{i}",
                    task_name=item["task_name"],
                    suggested_duration=item["suggested_duration"],
                    priority=priority,
                    order=i,
                    status="pending",
                    notes=item.get("notes"),
                    scheduled_start=scheduled_start,
                    scheduled_end=scheduled_end
                )
                planned_tasks.append(planned_task)
                logger.info(f"Created planned task: {item['task_name']}, duration: {item['suggested_duration']}")
            
            # Extract existing tasks from user context if available
            # Use the shared converter to ensure proper PlannedTask objects
            existing_tasks = []
            if user_context.existing_plans:
                for plan in user_context.existing_plans:
                    plan_tasks = plan.get('tasks') if isinstance(plan, dict) else getattr(plan, 'tasks', None)
                    if plan_tasks:
                        converted = _convert_existing_tasks(plan_tasks)
                        existing_tasks.extend(converted)
                logger.info(f"Found {len(existing_tasks)} existing scheduled tasks (converted to PlannedTask)")
            
            # Use schedule service to enforce timing
            scheduled_tasks = schedule_service.enforce_timing(
                planned_tasks,
                target_date,
                user_context.commitments,
                user_context.sleep_schedule,
                user_context.energy_profile,
                existing_tasks if existing_tasks else None
            )
            
            logger.info("Schedule enforcement complete", scheduled_count=len(scheduled_tasks))
            
            # Convert back to dict format
            result = []
            for task in scheduled_tasks:
                task_dict = {
                    "task_name": task.task_name,
                    "suggested_duration": task.suggested_duration,
                    "priority": task.priority.value if hasattr(task.priority, 'value') else task.priority,
                    "notes": task.notes,
                    "scheduled_start": task.scheduled_start,
                    "scheduled_end": task.scheduled_end
                }
                if task.scheduled_start and task.scheduled_end:
                    logger.info(f"✅ Scheduled task: {task.task_name} at {task.scheduled_start} - {task.scheduled_end}")
                else:
                    logger.error(f"❌ Task NOT scheduled: {task.task_name} - missing times!")
                result.append(task_dict)
            
            return result
        except Exception as e:
            import traceback
            print("=" * 60)
            print("❌❌❌ EXCEPTION IN _enforce_schedule_constraints ❌❌❌")
            print(f"Exception type: {type(e).__name__}")
            print(f"Exception message: {str(e)}")
            traceback.print_exc()
            print("=" * 60)
            logger.error("❌ Error enforcing schedule constraints - returning UNSCHEDULED tasks!", error=str(e), exc_info=True)
            logger.error(f"Exception type: {type(e).__name__}, Details: {str(e)}")
            # Return original plan if scheduling fails
            return plan_items

    async def update_plan(self, request: AIPlanUpdateRequest) -> AIPlanResponse:
        """Update an existing plan based on user modifications"""
        prompt = f"""Current plan:
{json.dumps(request.current_plan.model_dump(), indent=2)}

User modifications: {request.modifications}

Please update the plan according to the user's modifications while maintaining energy-aware scheduling.
Respond with the updated JSON in the same format."""
        
        try:
            response_text = await self._call_agent(prompt)
            response_data = self._parse_json_response(response_text)
            return AIPlanResponse(**response_data)
        except Exception as e:
            logger.error("Error updating plan", error=str(e))
            return request.current_plan
    
    async def get_reflection(self, request: AIReflectionRequest) -> AIReflectionResponse:
        """Generate reflection prompts and suggestions"""
        prompt = f"""Generate end-of-day reflection insights for a user with:
- Completed tasks: {', '.join(request.completed_tasks) or 'None'}
- Skipped tasks: {', '.join(request.skipped_tasks) or 'None'}
- Energy level: {request.energy_level}/5
- Focus level: {request.focus_level}/5

Respond with JSON containing:
{{
  "prompts": ["Reflection prompt 1", "Reflection prompt 2"],
  "suggestions": ["Suggestion for tomorrow 1", "Suggestion 2"]
}}"""
        
        try:
            response_text = await self._call_agent(prompt)
            response_data = self._parse_json_response(response_text)
            return AIReflectionResponse(
                prompts=response_data.get("prompts", []),
                suggestions=response_data.get("suggestions", []),
            )
        except Exception as e:
            logger.error("Error generating reflection", error=str(e))
            return AIReflectionResponse(
                prompts=[
                    "What task gave you the most satisfaction today?",
                    "What would you do differently tomorrow?",
                ],
                suggestions=[
                    "Start tomorrow with your most important task",
                    "Take regular breaks to maintain energy",
                ],
            )
    
    async def classify_task(self, request: AIClassifyRequest) -> AITaskClassification:
        """Classify a single task based on its description"""
        prompt = f"""Classify this task: "{request.task_description}"

Respond with JSON:
{{
  "name": "Clean task name",
  "type": "deep_focus|light_focus|admin|physical|recovery",
  "estimated_effort": 1-5,
  "flexibility": "fixed|flexible"
}}"""
        
        try:
            response_text = await self._call_agent(prompt)
            response_data = self._parse_json_response(response_text)
            return AITaskClassification(**response_data)
        except Exception as e:
            logger.error("Error classifying task", error=str(e))
            return AITaskClassification(
                name=request.task_description,
                type=CognitiveLoad.LIGHT_FOCUS,
                estimated_effort=3,
                flexibility=TaskFlexibility.FLEXIBLE,
            )
    
    def _generate_fallback_plan(self, raw_input: str) -> AIPlanResponse:
        """Generate a fallback plan when AI is unavailable"""
        # Parse tasks from raw input (simple line-by-line parsing)
        lines = [line.strip() for line in raw_input.split('\n') if line.strip()]
        tasks = []
        plan = []
        
        for i, line in enumerate(lines[:10]):  # Limit to 10 tasks
            # Remove bullet points and numbers
            task_name = line.lstrip('•-*0123456789.) ')
            if not task_name:
                continue
            
            tasks.append({
                "name": task_name,
                "type": "light_focus",
                "estimated_effort": 3,
                "flexibility": "flexible",
            })
            plan.append({
                "task_name": task_name,
                "suggested_duration": "30 minutes",
                "priority": "medium",
                "notes": None,
            })
        
        return AIPlanResponse(
            tasks=tasks,
            plan=plan,
            recommendations=[
                "Start with your most important task during peak energy hours",
                "Take a short break between tasks to maintain focus",
                "Review and adjust the plan as needed throughout the day",
            ],
        )


# Singleton instance
ai_service = AIService()
