import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon,
  User,
  Moon,
  Sun,
  Bell,
  Clock,
  Zap,
  Calendar,
  Save,
  Plus,
  Trash2,
  Repeat,
  Play,
  Pause,
  Sunrise,
  BookOpen,
  Dumbbell,
} from 'lucide-react';
import { useUserProfileStore, useAuthStore } from '@/stores';
import { Commitment, EnergyPreference, CognitiveLoad, RecurringTask, RecurrenceType, RoutineTemplate, PresetTemplate } from '@/types';
import { Button, Input, Modal } from '@/components/ui';
import { commitmentService, profileService, recurringTaskService, routineTemplateService } from '@/services/api';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'profile' | 'energy' | 'sleep' | 'commitments' | 'routines'>('profile');
  const [isCommitmentModalOpen, setIsCommitmentModalOpen] = useState(false);
  const [isRecurringTaskModalOpen, setIsRecurringTaskModalOpen] = useState(false);
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [routineTemplates, setRoutineTemplates] = useState<RoutineTemplate[]>([]);
  const [presets, setPresets] = useState<Record<string, PresetTemplate>>({});
  const [presetsLoaded, setPresetsLoaded] = useState(false);

  const { user, updateUser } = useAuthStore();
  const {
    energyProfile,
    sleepSchedule,
    preferences,
    commitments,
    setEnergyProfile,
    setSleepSchedule,
    setPreferences,
    addCommitment,
    deleteCommitment,
  } = useUserProfileStore();

  // Form states
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [wakeTime, setWakeTime] = useState(sleepSchedule?.wake_time || '07:00');
  const [sleepTime, setSleepTime] = useState(sleepSchedule?.sleep_time || '23:00');
  const [windDownMinutes, setWindDownMinutes] = useState(sleepSchedule?.wind_down_minutes || 30);
  const [energyPreference, setEnergyPreference] = useState<EnergyPreference>(
    energyProfile?.preference || 'morning'
  );
  const [peakFocusStart, setPeakFocusStart] = useState(energyProfile?.peak_focus_start || '09:00');
  const [peakFocusEnd, setPeakFocusEnd] = useState(energyProfile?.peak_focus_end || '12:00');
  const [notificationsEnabled, setNotificationsEnabled] = useState(preferences?.notification_enabled ?? true);
  const [maxDailyHours, setMaxDailyHours] = useState(preferences?.max_daily_workload_hours || 8);

  // New commitment form
  const [newCommitment, setNewCommitment] = useState({
    name: '',
    type: 'work' as Commitment['type'],
    start_time: '09:00',
    end_time: '17:00',
    days_of_week: [1, 2, 3, 4, 5] as number[],
  });

  // New recurring task form
  const [newRecurringTask, setNewRecurringTask] = useState({
    name: '',
    description: '',
    estimated_minutes: 30,
    cognitive_load: 'light_focus',
    priority: 'medium',
    recurrence_type: 'weekdays' as RecurrenceType,
    days_of_week: [1, 2, 3, 4, 5] as number[],
    preferred_time: '' as string,
  });

  // Load recurring tasks and templates
  useEffect(() => {
    if (activeTab === 'routines') {
      recurringTaskService.getAll(false).then(setRecurringTasks).catch(() => {});
      routineTemplateService.getAll().then(setRoutineTemplates).catch(() => {});
      if (!presetsLoaded) {
        routineTemplateService.getPresets().then((p: Record<string, PresetTemplate>) => { setPresets(p); setPresetsLoaded(true); }).catch(() => {});
      }
    }
  }, [activeTab]);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'energy', label: 'Energy', icon: Zap },
    { id: 'sleep', label: 'Sleep', icon: Moon },
    { id: 'commitments', label: 'Commitments', icon: Calendar },
    { id: 'routines', label: 'Routines', icon: Repeat },
  ];

  const energyOptions: { value: EnergyPreference; label: string; description: string }[] = [
    { value: 'morning', label: 'Morning Person', description: 'Peak energy 6am - 12pm' },
    { value: 'afternoon', label: 'Afternoon Peak', description: 'Peak energy 12pm - 6pm' },
    { value: 'evening', label: 'Evening Worker', description: 'Peak energy 6pm - 10pm' },
    { value: 'night', label: 'Night Owl', description: 'Peak energy after 10pm' },
  ];

  const handleSaveProfile = () => {
    updateUser({ full_name: fullName });
    toast.success('Profile updated!');
  };

  const handleSaveEnergy = async () => {
    try {
      const profileData = {
        preference: energyPreference,
        peak_focus_start: peakFocusStart,
        peak_focus_end: peakFocusEnd,
        fatigue_points: ['14:00', '16:00'],
      };
      
      // Save to backend
      const savedProfile = await profileService.saveEnergyProfile(profileData);
      
      // Update local state
      setEnergyProfile(savedProfile);
      toast.success('Energy profile saved!');
    } catch (error) {
      console.error('Failed to save energy profile:', error);
      toast.error('Failed to save energy profile');
    }
  };

  const handleSaveSleep = async () => {
    try {
      const scheduleData = {
        wake_time: wakeTime,
        sleep_time: sleepTime,
        wind_down_minutes: windDownMinutes,
      };
      
      // Save to backend
      const savedSchedule = await profileService.saveSleepSchedule(scheduleData);
      
      // Update local state
      setSleepSchedule(savedSchedule);
      toast.success('Sleep schedule saved!');
    } catch (error) {
      console.error('Failed to save sleep schedule:', error);
      toast.error('Failed to save sleep schedule');
    }
  };

  const handleAddCommitment = async () => {
    try {
      const commitment: Commitment = {
        id: `commitment-${Date.now()}`,
        user_id: user?.id || '',
        ...newCommitment,
        is_recurring: true,
        created_at: new Date().toISOString(),
      };
      
      // Save to backend
      const savedCommitment = await commitmentService.create({
        name: newCommitment.name,
        type: newCommitment.type,
        start_time: newCommitment.start_time,
        end_time: newCommitment.end_time,
        days_of_week: newCommitment.days_of_week,
      });
      
      // Update local state with the response from server
      addCommitment(savedCommitment);
      setIsCommitmentModalOpen(false);
      setNewCommitment({
        name: '',
        type: 'work',
        start_time: '09:00',
        end_time: '17:00',
        days_of_week: [1, 2, 3, 4, 5],
      });
      toast.success('Commitment added!');
    } catch (error) {
      console.error('Failed to add commitment:', error);
      toast.error('Failed to add commitment');
    }
  };

  const handleDeleteCommitment = async (id: string) => {
    if (confirm('Are you sure you want to delete this commitment?')) {
      try {
        await commitmentService.delete(id);
        deleteCommitment(id);
        toast.success('Commitment deleted');
      } catch (error) {
        console.error('Failed to delete commitment:', error);
        toast.error('Failed to delete commitment');
      }
    }
  };

  // Recurring Task handlers
  const handleAddRecurringTask = async () => {
    try {
      const taskData = {
        ...newRecurringTask,
        preferred_time: newRecurringTask.preferred_time || null,
        flexibility: newRecurringTask.preferred_time ? 'fixed' : 'flexible',
      };
      const saved = await recurringTaskService.create(taskData);
      setRecurringTasks((prev) => [...prev, saved]);
      setIsRecurringTaskModalOpen(false);
      setNewRecurringTask({
        name: '',
        description: '',
        estimated_minutes: 30,
        cognitive_load: 'light_focus',
        priority: 'medium',
        recurrence_type: 'weekdays',
        days_of_week: [1, 2, 3, 4, 5],
        preferred_time: '',
      });
      toast.success('Recurring task created!');
    } catch (error) {
      console.error('Failed to create recurring task:', error);
      toast.error('Failed to create recurring task');
    }
  };

  const handleDeleteRecurringTask = async (id: string) => {
    try {
      await recurringTaskService.delete(id);
      setRecurringTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success('Recurring task deleted');
    } catch (error) {
      toast.error('Failed to delete recurring task');
    }
  };

  const handleToggleRecurringTask = async (id: string) => {
    try {
      const updated = await recurringTaskService.toggle(id);
      setRecurringTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (error) {
      toast.error('Failed to toggle task');
    }
  };

  const handleApplyPreset = async (key: string) => {
    try {
      const template = await routineTemplateService.applyPreset(key);
      setRoutineTemplates((prev) => [...prev, template]);
      setRecurringTasks((prev) => [...prev, ...(template.tasks || [])]);
      toast.success(`${template.name} routine applied!`);
    } catch (error) {
      toast.error('Failed to apply routine template');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await routineTemplateService.delete(id);
      setRoutineTemplates((prev) => prev.filter((t) => t.id !== id));
      // refresh recurring tasks since template tasks now have null template_id
      recurringTaskService.getAll(false).then(setRecurringTasks).catch(() => {});
      toast.success('Routine template deleted');
    } catch (error) {
      toast.error('Failed to delete template');
    }
  };

  const toggleRecurringDay = (day: number) => {
    setNewRecurringTask((prev) => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter((d) => d !== day)
        : [...prev.days_of_week, day].sort(),
    }));
  };

  const toggleDay = (day: number) => {
    setNewCommitment((prev) => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter((d) => d !== day)
        : [...prev.days_of_week, day].sort(),
    }));
  };

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-apple-lg bg-gradient-to-br from-gray-100 to-gray-200">
          <SettingsIcon className="w-8 h-8 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Customize your Taskly experience</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-apple text-sm font-medium whitespace-nowrap transition-all',
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="glass-card space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Profile Settings</h2>

            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
            />

            <Input
              label="Email"
              value={user?.email || ''}
              disabled
              helperText="Email cannot be changed"
            />

            {/* Notification Toggle */}
            <div className="flex items-center justify-between p-4 rounded-apple bg-gray-50">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">Push Notifications</p>
                  <p className="text-sm text-gray-600">Receive reminders and alerts</p>
                </div>
              </div>
              <button
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={clsx(
                  'relative w-12 h-6 rounded-full transition-colors',
                  notificationsEnabled ? 'bg-blue-600' : 'bg-gray-300'
                )}
              >
                <span
                  className={clsx(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                    notificationsEnabled ? 'translate-x-7' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            <Button variant="primary" onClick={handleSaveProfile}>
              <Save className="w-4 h-4 mr-2" />
              Save Profile
            </Button>
          </div>
        )}

        {/* Energy Tab */}
        {activeTab === 'energy' && (
          <div className="glass-card space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Energy Profile</h2>

            {/* Energy Preference */}
            <div>
              <label className="label">When do you feel most productive?</label>
              <div className="grid sm:grid-cols-2 gap-3">
                {energyOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setEnergyPreference(option.value)}
                    className={clsx(
                      'p-4 rounded-apple border text-left transition-all',
                      energyPreference === option.value
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-300 hover:border-gray-400'
                    )}
                  >
                    <p className="font-medium text-gray-900">{option.label}</p>
                    <p className="text-sm text-gray-600">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Peak Focus Window */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                type="time"
                label="Peak Focus Start"
                value={peakFocusStart}
                onChange={(e) => setPeakFocusStart(e.target.value)}
              />
              <Input
                type="time"
                label="Peak Focus End"
                value={peakFocusEnd}
                onChange={(e) => setPeakFocusEnd(e.target.value)}
              />
            </div>

            {/* Max Daily Hours */}
            <div>
              <label className="label">Maximum Daily Workload (hours)</label>
              <div className="flex gap-2">
                {[4, 6, 8, 10, 12].map((hours) => (
                  <button
                    key={hours}
                    onClick={() => setMaxDailyHours(hours)}
                    className={clsx(
                      'flex-1 py-2 rounded-apple border text-sm font-medium transition-all',
                      maxDailyHours === hours
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    )}
                  >
                    {hours}h
                  </button>
                ))}
              </div>
            </div>

            <Button variant="primary" onClick={handleSaveEnergy}>
              <Save className="w-4 h-4 mr-2" />
              Save Energy Profile
            </Button>
          </div>
        )}

        {/* Sleep Tab */}
        {activeTab === 'sleep' && (
          <div className="glass-card space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Sleep Schedule</h2>
            <p className="text-gray-600 -mt-4">
              AI will respect your sleep schedule when planning tasks
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                type="time"
                label="Wake Up Time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                leftIcon={<Sun className="w-4 h-4" />}
              />
              <Input
                type="time"
                label="Sleep Time"
                value={sleepTime}
                onChange={(e) => setSleepTime(e.target.value)}
                leftIcon={<Moon className="w-4 h-4" />}
              />
            </div>

            {/* Wind Down Time */}
            <div>
              <label className="label">Wind Down Period (minutes)</label>
              <p className="text-sm text-gray-600 mb-3">
                Time before sleep when no demanding tasks should be scheduled
              </p>
              <div className="flex gap-2">
                {[15, 30, 45, 60, 90].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setWindDownMinutes(mins)}
                    className={clsx(
                      'flex-1 py-2 rounded-apple border text-sm font-medium transition-all',
                      windDownMinutes === mins
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    )}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <Button variant="primary" onClick={handleSaveSleep}>
              <Save className="w-4 h-4 mr-2" />
              Save Sleep Schedule
            </Button>
          </div>
        )}

        {/* Commitments Tab */}
        {activeTab === 'commitments' && (
          <div className="space-y-4">
            <div className="glass-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Fixed Commitments</h2>
                  <p className="text-sm text-gray-600">
                    Work, school, or other recurring obligations
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => setIsCommitmentModalOpen(true)}
                >
                  Add
                </Button>
              </div>

              {commitments.length > 0 ? (
                <div className="space-y-3">
                  {commitments.map((commitment) => (
                    <div
                      key={commitment.id}
                      className="flex items-center justify-between p-4 rounded-apple bg-gray-50"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{commitment.name}</p>
                        <p className="text-sm text-gray-600">
                          {commitment.start_time} - {commitment.end_time} •{' '}
                          {commitment.days_of_week.map((d) => dayLabels[d]).join(', ')}
                        </p>
                      </div>
                      <button
                        onClick={() => commitment.id && handleDeleteCommitment(commitment.id)}
                        className="p-2 rounded-apple text-gray-500 hover:text-red-600 hover:bg-gray-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-gray-600">
                  No commitments added yet
                </p>
              )}
            </div>
          </div>
        )}

        {/* Routines Tab */}
        {activeTab === 'routines' && (
          <div className="space-y-4">
            {/* Preset Templates */}
            {Object.keys(presets).length > 0 && routineTemplates.length === 0 && (
              <div className="glass-card">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Quick Start Templates</h2>
                <p className="text-sm text-gray-600 mb-4">Apply a pre-built routine to get started fast</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(presets).map(([key, preset]) => {
                    const iconMap: Record<string, React.ReactNode> = {
                      sunrise: <Sunrise className="w-5 h-5 text-orange-500" />,
                      moon: <Moon className="w-5 h-5 text-indigo-500" />,
                      book: <BookOpen className="w-5 h-5 text-blue-500" />,
                      dumbbell: <Dumbbell className="w-5 h-5 text-green-500" />,
                    };
                    return (
                      <button
                        key={key}
                        onClick={() => handleApplyPreset(key)}
                        className="flex items-start gap-3 p-4 rounded-apple border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left"
                      >
                        <div className="p-2 rounded-apple bg-gray-100">
                          {iconMap[preset.icon] || <Repeat className="w-5 h-5 text-gray-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{preset.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{preset.description}</p>
                          <p className="text-xs text-blue-600 mt-1">{preset.task_count} tasks: {preset.tasks_preview.join(', ')}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Routine Templates */}
            {routineTemplates.length > 0 && (
              <div className="glass-card">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Your Routines</h2>
                <div className="space-y-3">
                  {routineTemplates.map((tmpl) => (
                    <div key={tmpl.id} className="p-4 rounded-apple bg-gray-50 border border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Repeat className="w-4 h-4 text-blue-500" />
                          <span className="font-medium text-gray-900">{tmpl.name}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteTemplate(tmpl.id)}
                          className="p-1.5 rounded-apple text-gray-400 hover:text-red-600 hover:bg-gray-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {tmpl.description && (
                        <p className="text-xs text-gray-500 mb-2">{tmpl.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {tmpl.tasks.map((t) => (
                          <span key={t.id} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Recurring Tasks */}
            <div className="glass-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Recurring Tasks</h2>
                  <p className="text-sm text-gray-600">
                    Tasks that auto-appear in your daily plan
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => setIsRecurringTaskModalOpen(true)}
                >
                  Add
                </Button>
              </div>

              {recurringTasks.length > 0 ? (
                <div className="space-y-2">
                  {recurringTasks.map((task) => (
                    <div
                      key={task.id}
                      className={clsx(
                        'flex items-center justify-between p-3 rounded-apple border transition-all',
                        task.is_active
                          ? 'bg-white border-gray-200'
                          : 'bg-gray-50 border-gray-100 opacity-60'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={clsx('font-medium', task.is_active ? 'text-gray-900' : 'text-gray-500')}>
                            {task.name}
                          </p>
                          {!task.is_active && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">Paused</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {task.estimated_minutes}min •{' '}
                          {task.preferred_time || 'Flexible time'} •{' '}
                          {task.recurrence_type === 'daily' ? 'Every day' :
                           task.recurrence_type === 'weekdays' ? 'Weekdays' :
                           task.recurrence_type === 'weekends' ? 'Weekends' :
                           task.days_of_week.map((d) => dayLabels[d]).join(', ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleRecurringTask(task.id)}
                          className={clsx(
                            'p-1.5 rounded-apple transition-all',
                            task.is_active
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-gray-400 hover:bg-gray-200'
                          )}
                          title={task.is_active ? 'Pause' : 'Resume'}
                        >
                          {task.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDeleteRecurringTask(task.id)}
                          className="p-1.5 rounded-apple text-gray-400 hover:text-red-600 hover:bg-gray-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-gray-600">
                  No recurring tasks yet. Add one or apply a template above!
                </p>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* Add Commitment Modal */}
      <Modal
        isOpen={isCommitmentModalOpen}
        onClose={() => setIsCommitmentModalOpen(false)}
        title="Add Commitment"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={newCommitment.name}
            onChange={(e) => setNewCommitment({ ...newCommitment, name: e.target.value })}
            placeholder="e.g., Work, School, Gym"
          />

          <div>
            <label className="label">Type</label>
            <div className="flex gap-2 flex-wrap">
              {(['work', 'school', 'meeting', 'appointment', 'other'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setNewCommitment({ ...newCommitment, type })}
                  className={clsx(
                    'px-3 py-1.5 rounded-apple border text-sm capitalize transition-all',
                    newCommitment.type === type
                      ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              type="time"
              label="Start Time"
              value={newCommitment.start_time}
              onChange={(e) => setNewCommitment({ ...newCommitment, start_time: e.target.value })}
            />
            <Input
              type="time"
              label="End Time"
              value={newCommitment.end_time}
              onChange={(e) => setNewCommitment({ ...newCommitment, end_time: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Days of Week</label>
            <div className="flex gap-2">
              {dayLabels.map((label, index) => (
                <button
                  key={index}
                  onClick={() => toggleDay(index)}
                  className={clsx(
                    'flex-1 py-2 rounded-apple border text-sm font-medium transition-all',
                    newCommitment.days_of_week.includes(index)
                      ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsCommitmentModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleAddCommitment}
              disabled={!newCommitment.name}
            >
              Add Commitment
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Recurring Task Modal */}
      <Modal
        isOpen={isRecurringTaskModalOpen}
        onClose={() => setIsRecurringTaskModalOpen(false)}
        title="Add Recurring Task"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Task Name"
            value={newRecurringTask.name}
            onChange={(e) => setNewRecurringTask({ ...newRecurringTask, name: e.target.value })}
            placeholder="e.g., Morning Meditation, Gym, Review Notes"
          />

          <Input
            label="Description (optional)"
            value={newRecurringTask.description}
            onChange={(e) => setNewRecurringTask({ ...newRecurringTask, description: e.target.value })}
            placeholder="Brief description"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Duration (minutes)</label>
              <input
                type="number"
                min={5}
                max={480}
                value={newRecurringTask.estimated_minutes}
                onChange={(e) => setNewRecurringTask({ ...newRecurringTask, estimated_minutes: parseInt(e.target.value) || 30 })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Preferred Time (optional)</label>
              <input
                type="time"
                value={newRecurringTask.preferred_time}
                onChange={(e) => setNewRecurringTask({ ...newRecurringTask, preferred_time: e.target.value })}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty for flexible scheduling</p>
            </div>
          </div>

          <div>
            <label className="label">Recurrence</label>
            <div className="flex gap-2 flex-wrap">
              {([
                { value: 'daily', label: 'Every Day' },
                { value: 'weekdays', label: 'Weekdays' },
                { value: 'weekends', label: 'Weekends' },
                { value: 'custom', label: 'Custom' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    const days = opt.value === 'daily' ? [0,1,2,3,4,5,6]
                      : opt.value === 'weekdays' ? [1,2,3,4,5]
                      : opt.value === 'weekends' ? [0,6]
                      : newRecurringTask.days_of_week;
                    setNewRecurringTask({ ...newRecurringTask, recurrence_type: opt.value, days_of_week: days });
                  }}
                  className={clsx(
                    'px-3 py-1.5 rounded-apple border text-sm transition-all',
                    newRecurringTask.recurrence_type === opt.value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {newRecurringTask.recurrence_type === 'custom' && (
            <div>
              <label className="label">Days of Week</label>
              <div className="flex gap-2">
                {dayLabels.map((label, index) => (
                  <button
                    key={index}
                    onClick={() => toggleRecurringDay(index)}
                    className={clsx(
                      'flex-1 py-2 rounded-apple border text-sm font-medium transition-all',
                      newRecurringTask.days_of_week.includes(index)
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Priority</label>
              <div className="flex gap-2">
                {(['high', 'medium', 'low'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNewRecurringTask({ ...newRecurringTask, priority: p })}
                    className={clsx(
                      'flex-1 py-1.5 rounded-apple border text-sm capitalize transition-all',
                      newRecurringTask.priority === p
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Type</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { value: 'deep_focus', label: 'Focus' },
                  { value: 'light_focus', label: 'Light' },
                  { value: 'physical', label: 'Physical' },
                  { value: 'recovery', label: 'Recovery' },
                ] as const).map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setNewRecurringTask({ ...newRecurringTask, cognitive_load: t.value })}
                    className={clsx(
                      'px-2 py-1.5 rounded-apple border text-xs transition-all',
                      newRecurringTask.cognitive_load === t.value
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                        : 'border-gray-300 text-gray-700 hover:border-gray-400'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsRecurringTaskModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleAddRecurringTask}
              disabled={!newRecurringTask.name}
            >
              Add Recurring Task
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
