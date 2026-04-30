"""Comprehensive test script for scheduling"""
from datetime import datetime, timedelta
from app.services.smart_scheduler import smart_schedule, categorize_slots_by_energy
from app.services.schedule_service import schedule_service
from app.services.ai_service import _convert_existing_tasks
from app.models.schemas import EnergyProfileBase, SleepScheduleBase, Commitment
from app.models import PlannedTask, Priority

def test_basic_scheduling():
    """Test 1: Basic scheduling works"""
    print("=" * 60)
    print("TEST 1: Basic scheduling")
    print("=" * 60)

    energy = EnergyProfileBase(
        preference='night',
        peak_focus_start='21:00',
        peak_focus_end='01:00',
        fatigue_points=['14:00', '16:00']
    )

    base = datetime(2026, 1, 30, 17, 30)
    slots = [(base, base + timedelta(hours=7, minutes=15))]

    task = PlannedTask(
        id='test-1', task_id='task-1',
        task_name='Work on personal project',
        suggested_duration='60 minutes',
        priority=Priority.MEDIUM, order=0, status='pending'
    )

    scheduled = smart_schedule([task], slots, energy, include_breaks=True)
    assert len(scheduled) >= 1, "Should schedule at least 1 task"
    real_tasks = [t for t in scheduled if not t.is_break]
    assert real_tasks[0].scheduled_start is not None, "Task should have scheduled_start"
    print(f"  ✅ Scheduled {len(real_tasks)} task(s), {len(scheduled) - len(real_tasks)} break(s)")
    for t in scheduled:
        prefix = "🔵" if not t.is_break else "⏸️"
        print(f"    {prefix} {t.task_name}: {t.scheduled_start} - {t.scheduled_end}")


def test_no_overlap():
    """Test 2: Multiple tasks don't overlap"""
    print("\n" + "=" * 60)
    print("TEST 2: No overlapping tasks")
    print("=" * 60)

    energy = EnergyProfileBase(
        preference='morning',
        peak_focus_start='09:00',
        peak_focus_end='12:00',
        fatigue_points=['14:00']
    )

    base = datetime(2026, 1, 30, 9, 0)
    slots = [(base, base + timedelta(hours=4))]  # 09:00 - 13:00 (4 hours)

    tasks = [
        PlannedTask(id=f'test-{i}', task_id=f'task-{i}',
                    task_name=name, suggested_duration=dur,
                    priority=Priority.MEDIUM, order=i, status='pending')
        for i, (name, dur) in enumerate([
            ('Deep coding', '90 minutes'),
            ('Email review', '30 minutes'),
            ('Team standup', '15 minutes'),
            ('Code review', '45 minutes'),
        ])
    ]

    scheduled = smart_schedule(tasks, slots, energy, include_breaks=True)
    real_tasks = [t for t in scheduled if not t.is_break]
    
    # Check no overlaps
    all_items = sorted(scheduled, key=lambda t: t.scheduled_start or '00:00')
    for i in range(len(all_items) - 1):
        end_i = all_items[i].scheduled_end
        start_next = all_items[i+1].scheduled_start
        assert end_i <= start_next, \
            f"OVERLAP! '{all_items[i].task_name}' ends at {end_i} but '{all_items[i+1].task_name}' starts at {start_next}"
    
    print(f"  ✅ {len(real_tasks)} tasks + {len(scheduled) - len(real_tasks)} breaks, NO overlaps")
    for t in sorted(scheduled, key=lambda t: t.scheduled_start or '00:00'):
        prefix = "🔵" if not t.is_break else "⏸️"
        print(f"    {prefix} {t.task_name}: {t.scheduled_start} - {t.scheduled_end}")


def test_existing_task_blocking():
    """Test 3: Existing tasks block their time slots so new tasks don't overlap"""
    print("\n" + "=" * 60)
    print("TEST 3: Existing tasks block their time slots")
    print("=" * 60)

    energy = EnergyProfileBase(
        preference='morning',
        peak_focus_start='09:00',
        peak_focus_end='12:00',
        fatigue_points=['14:00']
    )
    sleep = SleepScheduleBase(
        wake_time='07:00', sleep_time='23:00', wind_down_minutes=30
    )
    commitments = []

    # First, get slots without existing tasks  
    all_slots = schedule_service.get_available_time_slots(
        '2026-01-30', commitments, sleep, existing_tasks=None, energy_profile=energy
    )
    total_mins_before = sum(int((s[1] - s[0]).total_seconds() // 60) for s in all_slots)
    print(f"  Total available: {total_mins_before} minutes without existing tasks")

    # Simulate: Task A was already scheduled at 09:00-10:30
    existing_task_a = PlannedTask(
        id='existing-a', task_id='',
        task_name='Task A (already scheduled)',
        suggested_duration='90 minutes',
        priority=Priority.HIGH, order=0, status='pending',
        scheduled_start='09:00', scheduled_end='10:30'
    )

    # Get slots WITH existing task blocking
    available_slots = schedule_service.get_available_time_slots(
        '2026-01-30', commitments, sleep,
        existing_tasks=[existing_task_a],
        energy_profile=energy
    )
    total_mins_after = sum(int((s[1] - s[0]).total_seconds() // 60) for s in available_slots)
    print(f"  Total available: {total_mins_after} minutes with Task A blocking 09:00-10:30")
    assert total_mins_after < total_mins_before, \
        f"Available time should decrease! Before: {total_mins_before}, After: {total_mins_after}"
    
    # Verify none of the available slots overlap with 09:00-10:30
    existing_start = datetime(2026, 1, 30, 9, 0)
    existing_end = datetime(2026, 1, 30, 10, 30)
    for slot_start, slot_end in available_slots:
        # Slot must either end before 09:00 or start after 10:30
        assert slot_end <= existing_start or slot_start >= existing_end, \
            f"Slot {slot_start.strftime('%H:%M')}-{slot_end.strftime('%H:%M')} overlaps with existing task 09:00-10:30!"

    print(f"  ✅ Available time reduced by {total_mins_before - total_mins_after} minutes")
    print(f"  ✅ No available slots overlap with existing task")
    for s, e in available_slots:
        print(f"    ⬜ {s.strftime('%H:%M')} - {e.strftime('%H:%M')}")

    # Now schedule new task B in the remaining slots
    task_b = PlannedTask(
        id='test-b', task_id='task-b',
        task_name='Task B (new)',
        suggested_duration='60 minutes',
        priority=Priority.MEDIUM, order=0, status='pending'
    )
    
    scheduled = smart_schedule([task_b], available_slots, energy, include_breaks=False)
    real = [t for t in scheduled if not t.is_break]
    assert len(real) == 1, f"Should schedule Task B, got {len(real)} tasks"
    
    # Verify Task B doesn't overlap with Task A's 09:00-10:30
    b_start = real[0].scheduled_start
    b_end = real[0].scheduled_end
    assert b_end <= '09:00' or b_start >= '10:30', \
        f"Task B ({b_start}-{b_end}) overlaps with Task A (09:00-10:30)!"
    
    print(f"  ✅ Task B scheduled at {b_start}-{b_end}, no overlap with Task A (09:00-10:30)")


def test_convert_existing_tasks():
    """Test 4: _convert_existing_tasks helper works correctly"""
    print("\n" + "=" * 60)
    print("TEST 4: _convert_existing_tasks helper")
    print("=" * 60)

    raw_tasks = [
        {
            'id': 'abc-123',
            'task_id': '',
            'task_name': 'Existing task 1',
            'suggested_duration': '45 minutes',
            'priority': 'high',
            'order': 0,
            'status': 'pending',
            'scheduled_start': '09:00',
            'scheduled_end': '09:45',
        },
        {
            'task_name': 'Incomplete task (no times)',
            'priority': 'low',
        },
        {
            'task_name': 'Task with times',
            'scheduled_start': '14:00',
            'scheduled_end': '15:00',
            'priority': 'medium',
        },
    ]

    converted = _convert_existing_tasks(raw_tasks)
    # Should convert 2 tasks (the ones with scheduled_start and scheduled_end)
    assert len(converted) == 2, f"Expected 2 converted tasks, got {len(converted)}"
    assert converted[0].task_name == 'Existing task 1'
    assert converted[0].scheduled_start == '09:00'
    assert converted[1].task_name == 'Task with times'
    print(f"  ✅ Converted {len(converted)} of {len(raw_tasks)} tasks (skipped 1 without times)")
    for t in converted:
        print(f"    📌 {t.task_name}: {t.scheduled_start} - {t.scheduled_end}")


def test_cross_midnight():
    """Test 5: Cross-midnight scheduling works for night owls"""
    print("\n" + "=" * 60)
    print("TEST 5: Cross-midnight scheduling")
    print("=" * 60)

    energy = EnergyProfileBase(
        preference='night',
        peak_focus_start='22:00',
        peak_focus_end='02:00',
        fatigue_points=['14:00']
    )

    # Slot from 22:00 to 02:00 (crosses midnight)
    base = datetime(2026, 1, 30, 22, 0)
    slots = [(base, base + timedelta(hours=4))]  # 22:00 → 02:00 next day

    tasks = [
        PlannedTask(id='night-1', task_id='', task_name='Late night coding',
                    suggested_duration='120 minutes', priority=Priority.HIGH,
                    order=0, status='pending'),
        PlannedTask(id='night-2', task_id='', task_name='Quick review',
                    suggested_duration='30 minutes', priority=Priority.MEDIUM,
                    order=1, status='pending'),
    ]

    scheduled = smart_schedule(tasks, slots, energy, include_breaks=True)
    real = [t for t in scheduled if not t.is_break]
    assert len(real) == 2, f"Should schedule both tasks, got {len(real)}"
    print(f"  ✅ Scheduled {len(real)} tasks across midnight")
    for t in sorted(scheduled, key=lambda t: t.scheduled_start or '00:00'):
        prefix = "🔵" if not t.is_break else "⏸️"
        print(f"    {prefix} {t.task_name}: {t.scheduled_start} - {t.scheduled_end}")


# Run all tests
if __name__ == '__main__':
    passed = 0
    failed = 0
    for test_fn in [test_basic_scheduling, test_no_overlap, test_existing_task_blocking,
                    test_convert_existing_tasks, test_cross_midnight]:
        try:
            test_fn()
            passed += 1
        except AssertionError as e:
            print(f"  ❌ FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"  ❌ ERROR: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("\n" + "=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 60)
