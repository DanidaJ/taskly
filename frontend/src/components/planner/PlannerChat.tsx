import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, addDays, parseISO } from 'date-fns';
import {
  Sparkles,
  Send,
  Loader2,
  Bot,
  User,
  CheckCircle2,
  AlertCircle,
  Info,
  RefreshCw,
  Save,
  Moon,
  Zap,
  Brain,
} from 'lucide-react';
import { useTaskStore, useUserProfileStore, useUserPatternsStore, useBacklogStore, useProjectStore } from '@/stores';
import { aiService } from '@/services';
import { focusSessionService, sleepEntryService } from '@/services/api';
import { AIPlanResponse, UserContext } from '@/types';
import { Button, Textarea } from '@/components/ui';
import { TaskCard } from '@/components/tasks';
import toast from 'react-hot-toast';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  type?: 'text' | 'clarification' | 'assumption' | 'plan';
  planData?: AIPlanResponse;
  clarificationOptions?: string[];
}

export default function PlannerChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<AIPlanResponse | null>(null);
  const [conversationContext, setConversationContext] = useState<string[]>([]);
  const [sleepContext, setSleepContext] = useState<{ quality: number; duration: number } | null>(null);
  const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [targetDate, setTargetDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { applyAIPlan, plansByDate } = useTaskStore();
  const {
    energyProfile,
    sleepSchedule,
    preferences,
    commitments,
    recentLogs,
  } = useUserProfileStore();
  const { patterns, addPattern, getPattern } = useUserPatternsStore();
  const {
    items: backlogItems,
    loadItems: loadBacklogItems,
    removeItem: removeBacklogItem,
  } = useBacklogStore();
  const { projects, loadProjects } = useProjectStore();

  // Load backlog so the AI can schedule directly from it.
  useEffect(() => {
    loadBacklogItems();
  }, [loadBacklogItems]);

  // Load projects so the AI can advance them in realistic daily chunks.
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Detect target date from user input
  const detectTargetDate = (input: string): string => {
    const lowerInput = input.toLowerCase();
    const today = new Date();
    
    if (/\b(tomorrow|tmrw|tmr)\b/i.test(lowerInput)) {
      return format(addDays(today, 1), 'yyyy-MM-dd');
    } else if (/\b(today|now)\b/i.test(lowerInput)) {
      return format(today, 'yyyy-MM-dd');
    } else if (/\b(day after tomorrow|overmorrow)\b/i.test(lowerInput)) {
      return format(addDays(today, 2), 'yyyy-MM-dd');
    }
    
    // Default to today if no date reference found
    return format(today, 'yyyy-MM-dd');
  };

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // Load connected data (sleep, focus) for smarter planning (backend only)
  useEffect(() => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    sleepEntryService.getAll(7)
      .then((entries: any[]) => {
        const lastSleep = (entries || []).find(
          (e: any) => e.date === yesterday || e.date === targetDate
        );
        if (lastSleep) {
          setSleepContext({ quality: lastSleep.quality, duration: lastSleep.duration });
        }
      })
      .catch((error) => {
        console.error('Failed to load sleep entries:', error);
      });

    focusSessionService.getForDateRange(weekAgo, todayStr)
      .then((sessions: any[]) => {
        const total = (sessions || [])
          .filter((s: any) => s.mode === 'focus' && s.completed)
          .reduce((acc: number, s: any) => acc + s.duration / 60, 0);
        setTodayFocusMinutes(Math.round(total / 7));
      })
      .catch((error) => {
        console.error('Failed to load focus sessions:', error);
      });
  }, [targetDate]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add initial greeting with context
  useEffect(() => {
    if (messages.length === 0) {
      let contextInfo = '';
      
      // Add commitment awareness
      if (commitments && commitments.length > 0) {
        const todayCommitments = commitments.filter(c => {
          const today = new Date().getDay(); // 0=Sunday
          return c.days_of_week.includes(today);
        });
        if (todayCommitments.length > 0) {
          contextInfo += `\n\n📅 I see you have ${todayCommitments.length} commitment(s) today:\n` + 
            todayCommitments.map(c => `  • ${c.name} (${c.start_time} - ${c.end_time})`).join('\n');
        }
      }
      
      // Add energy profile awareness
      if (energyProfile) {
        contextInfo += `\n\n⚡ Your peak focus hours are ${energyProfile.peak_focus_start} - ${energyProfile.peak_focus_end}. I'll schedule your most demanding tasks then.`;
      }
      
      // Add sleep awareness
      if (sleepSchedule) {
        contextInfo += `\n\n😴 I'll make sure everything wraps up by ${sleepSchedule.sleep_time} for your wind-down time.`;
      }
      
      // Add sleep context
      if (sleepContext) {
        if (sleepContext.quality <= 2) {
          contextInfo += `\n\n💤 I noticed your sleep quality was low last night. I'll suggest lighter tasks and more breaks today.`;
        } else if (sleepContext.quality >= 4 && sleepContext.duration >= 420) {
          contextInfo += `\n\n💪 Great sleep last night! Perfect conditions for tackling challenging work.`;
        }
      }

      // Add focus pattern context  
      if (todayFocusMinutes > 0) {
        contextInfo += `\n\n🧠 Based on your patterns, you typically focus for about ${todayFocusMinutes} minutes per session.`;
      }

      const greeting: ChatMessage = {
        id: 'greeting',
        role: 'assistant',
        content: `Hi! 👋 I'm your AI planning assistant. I know your schedule, energy patterns, and preferences.${contextInfo}\n\nTell me about your day - what tasks do you need to accomplish? I'll create an optimized schedule that works around your commitments and matches your energy levels!`,
        timestamp: new Date(),
        type: 'text',
      };
      setMessages([greeting]);
    }
  }, [commitments, energyProfile, sleepSchedule, sleepContext, todayFocusMinutes]);

  const buildUserContext = (): UserContext => {
    // Use targetDate plan, not just today's plan, so AI knows what's already scheduled
    const targetPlan = plansByDate[targetDate];
    const today = format(new Date(), 'yyyy-MM-dd');
    const todaysPlan = plansByDate[today];
    
    // Prefer targetDate plan; fall back to today's if same day
    const relevantPlans: any[] = [];
    if (targetPlan) relevantPlans.push(targetPlan);
    if (todaysPlan && today !== targetDate) relevantPlans.push(todaysPlan);
    
    return {
      commitments: commitments || [],
      energy_profile: energyProfile || {
        preference: 'morning',
        peak_focus_start: '09:00',
        peak_focus_end: '12:00',
        fatigue_points: ['14:00'],
      },
      sleep_schedule: sleepSchedule || {
        wake_time: '07:00',
        sleep_time: '23:00',
        wind_down_minutes: 30,
        preferred_end_time: null,
      },
      preferences: preferences || {
        manual_scheduling_allowed: true,
        task_clustering_enabled: true,
        max_daily_workload_hours: 8,
        preferred_task_types: ['deep_focus', 'light_focus', 'admin'],
        notification_enabled: true,
        dark_mode: true,
      },
      recent_logs: recentLogs || [],
      existing_plans: relevantPlans.length > 0 ? relevantPlans : undefined,
      backlog_items: (backlogItems || []).map((b) => ({
        id: b.id,
        name: b.name,
        estimated_minutes: b.estimated_minutes,
        priority: b.priority,
        notes: b.notes,
      })),
      projects: (projects || [])
        .filter((p) => p.status === 'active')
        .map((p) => ({
          name: p.name,
          total_hours: p.total_hours,
          hours_completed: p.hours_completed,
          deadline: p.deadline,
          weekly_hours_target: p.weekly_hours_target,
          status: p.status,
          priority: p.priority,
          subtasks: p.subtasks.map((s) => ({ name: s.name, status: s.status })),
        })),
    };
  };

  // Build context with learned patterns
  const buildEnhancedInput = (userInput: string): { 
    enhancedInput: string; 
    assumptions: string[];
  } => {
    const assumptions: string[] = [];
    let enhancedInput = userInput;

    // Common activities to check for patterns
    const activities = [
      'dinner', 'lunch', 'breakfast', 'workout', 'exercise', 'gym',
      'commute', 'meeting', 'break', 'meditation', 'reading', 'walk'
    ];

    // Check if any activities are mentioned without duration
    activities.forEach((activity) => {
      const regex = new RegExp(`\\b${activity}\\b`, 'i');
      if (regex.test(userInput)) {
        // Check if duration is already specified
        const hasDuration = /\d+\s*(hour|hr|minute|min|h|m)/i.test(
          userInput.slice(Math.max(0, userInput.toLowerCase().indexOf(activity) - 30), 
                         userInput.toLowerCase().indexOf(activity) + 50)
        );

        if (!hasDuration) {
          const pattern = getPattern('duration', activity);
          if (pattern && pattern.confidence >= 0.5) {
            assumptions.push(
              `I noticed you mentioned "${activity}" - based on your previous sessions, I'm assuming it takes ${pattern.value}. Let me know if that's different today!`
            );
            enhancedInput += ` (Note: ${activity} typically takes ${pattern.value} based on user history)`;
          }
        }
      }
    });

    return { enhancedInput, assumptions };
  };

  // Detect if clarification is needed
  const detectClarificationNeeds = (input: string, planTargetDate: string): { 
    needsClarification: boolean;
    questions: string[];
  } => {
    const questions: string[] = [];
    const lowerInput = input.toLowerCase();

    // Calculate day of week for the target date
    const targetDayOfWeek = parseISO(planTargetDate).getDay(); // 0=Sunday

    // Check for vague task descriptions
    if (/\b(some|a few|couple|several)\s+(tasks?|things?|stuff)\b/i.test(input)) {
      questions.push("Could you be more specific about what tasks you're referring to?");
    }

    // Check for "meeting" without details
    if (/\bmeeting\b/i.test(input) && !/\b(with|about|at|from)\b/i.test(input)) {
      questions.push("I see you have a meeting - who is it with, and roughly how long will it take?");
    }

    // Check for projects without duration
    if (/\bproject\b/i.test(input) && !/\d+\s*(hour|hr|minute|min)/i.test(input)) {
      if (!getPattern('duration', 'project')) {
        questions.push("How much time would you like to allocate for your project work today?");
      }
    }

    // Check for employment-related mentions (job/office hours) - NOT "work on a project"
    // Only ask if explicitly referring to job/office hours without times specified
    const isReferringToJobHours = /\b(at work|go to work|going to work|work hours|work today|in office|at office|at the office|office hours|my job|job hours)\b/i.test(input);
    
    if (isReferringToJobHours) {
      const hasWorkCommitment = commitments?.some(c => {
        const isTargetDay = c.days_of_week.includes(targetDayOfWeek);
        const isWorkRelated = c.name.toLowerCase().includes('work') || 
                              c.name.toLowerCase().includes('office') ||
                              c.name.toLowerCase().includes('job');
        return isTargetDay && isWorkRelated;
      });
      if (!hasWorkCommitment && !/\d{1,2}(:\d{2})?\s*(am|pm|to|-)/i.test(input)) {
        questions.push("What are your work hours today? (You can also add this as a commitment in Settings)");
      }
    }

    // Check for ambiguous time references
    if (/\b(later|sometime|eventually|when possible)\b/i.test(input)) {
      questions.push("You mentioned doing something 'later' - do you have a preferred time in mind?");
    }

    return {
      needsClarification: questions.length > 0,
      questions,
    };
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
      type: 'text',
    };

    setMessages((prev) => [...prev, userMessage]);
    setConversationContext((prev) => [...prev, inputValue]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Detect and update target date based on user input
      const detectedDate = detectTargetDate(inputValue);
      setTargetDate(detectedDate);
      
      // Pre-load the target date's plan from DB so AI knows about existing tasks
      if (!plansByDate[detectedDate]) {
        try {
          const { loadPlanFromDatabase } = useTaskStore.getState();
          await loadPlanFromDatabase(detectedDate);
        } catch (e) {
          // Plan may not exist for this date yet - that's fine
          console.log('No existing plan for', detectedDate);
        }
      }
      
      // Check if clarification is needed
      const { needsClarification, questions } = detectClarificationNeeds(inputValue, detectedDate);
      
      // Build enhanced input with patterns
      const { enhancedInput, assumptions } = buildEnhancedInput(inputValue);

      // Add assumption notifications
      if (assumptions.length > 0) {
        const assumptionMessage: ChatMessage = {
          id: `assumption-${Date.now()}`,
          role: 'assistant',
          content: assumptions.join('\n\n'),
          timestamp: new Date(),
          type: 'assumption',
        };
        setMessages((prev) => [...prev, assumptionMessage]);
      }

      // If clarification is needed and this is early in the conversation
      if (needsClarification && conversationContext.length < 2) {
        const clarificationMessage: ChatMessage = {
          id: `clarification-${Date.now()}`,
          role: 'assistant',
          content: `Before I create your plan, I have a few quick questions:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n')}`,
          timestamp: new Date(),
          type: 'clarification',
          clarificationOptions: questions,
        };
        setMessages((prev) => [...prev, clarificationMessage]);
        setIsLoading(false);
        return;
      }

      // Generate the plan
      const fullContext = conversationContext.join('\n');
      const userContext = buildUserContext();
      
      // Add learned patterns to user context for better AI understanding
      const patternContext = patterns
        .filter(p => p.confidence >= 0.5)
        .map(p => `${p.key}: ${p.value}`)
        .join(', ');

      // Send patterns as part of recent logs context, not as raw input
      const contextWithPatterns = {
        ...userContext,
        recent_logs: [
          ...userContext.recent_logs,
          ...(patternContext ? [{
            date: format(new Date(), 'yyyy-MM-dd'),
            energy_level: 4 as 1 | 2 | 3 | 4 | 5,
            focus_level: 4 as 1 | 2 | 3 | 4 | 5,
            completed_tasks: [],
            skipped_tasks: [],
            notes: `Historical patterns: ${patternContext}`
          }] : [])
        ]
      };

      const response = await aiService.generatePlan(
        `${fullContext}\n${enhancedInput}`,
        contextWithPatterns,
        targetDate
      );

      // Learn from the response
      learnFromPlan(response, inputValue);

      setPendingPlan(response);

      // Create response message
      const planMessage: ChatMessage = {
        id: `plan-${Date.now()}`,
        role: 'assistant',
        content: formatPlanResponse(response),
        timestamp: new Date(),
        type: 'plan',
        planData: response,
      };

      setMessages((prev) => [...prev, planMessage]);

    } catch (error) {
      console.error('Error generating plan:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm sorry, I encountered an error while creating your plan. Could you try rephrasing your request?",
        timestamp: new Date(),
        type: 'text',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Learn duration patterns from the plan
  const learnFromPlan = (plan: AIPlanResponse, userInput: string) => {
    const lowerInput = userInput.toLowerCase();
    
    plan.plan.forEach((item) => {
      const taskName = item.task_name.toLowerCase();
      const duration = item.suggested_duration;

      // Common activities to learn
      const activities = [
        'dinner', 'lunch', 'breakfast', 'workout', 'exercise', 'gym',
        'meeting', 'break', 'meditation', 'reading', 'walk', 'project'
      ];

      activities.forEach((activity) => {
        if (taskName.includes(activity) || lowerInput.includes(activity)) {
          // Only learn if user specified duration in their input
          const durationMatch = lowerInput.match(
            new RegExp(`${activity}[^.]*?(\\d+(?:\\.\\d+)?\\s*(?:hour|hr|minute|min|h|m))`, 'i')
          );
          
          if (durationMatch) {
            addPattern({
              category: 'duration',
              key: activity,
              value: durationMatch[1],
              confidence: 0.7,
            });
          }
        }
      });
    });
  };

  const formatPlanResponse = (plan: AIPlanResponse): string => {
    let response = "✨ **Here's your optimized plan:**\n\n";
    
    response += "**Tasks:**\n";
    plan.tasks.forEach((task, i) => {
      const typeEmoji = {
        deep_focus: '🧠',
        light_focus: '💡',
        admin: '📋',
        physical: '💪',
        recovery: '🌿',
      }[task.type] || '📌';
      response += `${i + 1}. ${typeEmoji} ${task.name} (${task.estimated_effort}/5 effort)\n`;
    });

    response += "\n**Suggested Schedule:**\n";
    plan.plan.forEach((item) => {
      const priorityEmoji = {
        high: '🔴',
        medium: '🟡',
        low: '🟢',
      }[item.priority] || '⚪';
      const timeStr = item.scheduled_start && item.scheduled_end 
        ? `⏰ ${item.scheduled_start} - ${item.scheduled_end}` 
        : item.suggested_duration;
      response += `${priorityEmoji} **${item.task_name}** - ${timeStr}\n`;
      if (item.notes) {
        response += `   _${item.notes}_\n`;
      }
    });

    if (plan.recommendations.length > 0) {
      response += "\n**💡 Recommendations:**\n";
      plan.recommendations.slice(0, 3).forEach((rec) => {
        response += `• ${rec}\n`;
      });
    }

    response += "\n_Would you like me to adjust anything, or shall I apply this plan?_";

    return response;
  };

  const handleApplyPlan = async () => {
    if (pendingPlan) {
      await applyAIPlan(pendingPlan, targetDate);

      // If the AI scheduled any backlog items (matched by exact name), remove
      // them from the backlog now that they live on the calendar.
      const plannedNames = new Set(
        pendingPlan.plan.map((p) => p.task_name.toLowerCase().trim())
      );
      const scheduledFromBacklog = (backlogItems || []).filter((b) =>
        plannedNames.has(b.name.toLowerCase().trim())
      );
      if (scheduledFromBacklog.length > 0) {
        await Promise.all(scheduledFromBacklog.map((b) => removeBacklogItem(b.id)));
      }

      toast.success('Plan applied to your schedule!');
      
      const confirmMessage: ChatMessage = {
        id: `confirm-${Date.now()}`,
        role: 'assistant',
        content: "✅ Your plan has been applied! You can view it in the Schedule page. Is there anything else you'd like to plan?",
        timestamp: new Date(),
        type: 'text',
      };
      setMessages((prev) => [...prev, confirmMessage]);
      setPendingPlan(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setConversationContext([]);
    setPendingPlan(null);
    // Trigger greeting again
    setTimeout(() => {
      const greeting: ChatMessage = {
        id: 'greeting',
        role: 'assistant',
        content: `Hi! 👋 I'm your AI planning assistant. Tell me about your day - what tasks do you need to accomplish?`,
        timestamp: new Date(),
        type: 'text',
      };
      setMessages([greeting]);
    }, 100);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-700/20">
            <Sparkles className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Planner</h1>
            <p className="text-gray-600 mt-1">
              Chat with AI to create your optimized schedule
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-medium text-blue-600">
                {format(currentTime, 'EEEE, MMMM d, yyyy')}
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-sm font-medium text-blue-600 tabular-nums">
                {format(currentTime, 'h:mm:ss a')}
              </span>
            </div>
          </div>
        </div>
        <Button variant="ghost" onClick={handleNewConversation}>
          <RefreshCw className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex gap-3 ${
                message.role === 'user' ? 'flex-row-reverse' : ''
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === 'user'
                    ? 'bg-blue-600'
                    : 'bg-gradient-to-br from-blue-600 to-purple-600'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>

              {/* Message Content */}
              <div
                className={`flex-1 max-w-[80%] ${
                  message.role === 'user' ? 'text-right' : ''
                }`}
              >
                <div
                  className={`inline-block p-4 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : message.type === 'clarification'
                      ? 'bg-amber-500/10 border border-amber-500/30 text-gray-900'
                      : message.type === 'assumption'
                      ? 'bg-blue-500/10 border border-blue-500/30 text-gray-900'
                      : 'bg-white text-gray-900 border border-gray-200'
                  }`}
                >
                  {message.type === 'clarification' && (
                    <div className="flex items-center gap-2 mb-2 text-amber-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Quick clarification</span>
                    </div>
                  )}
                  {message.type === 'assumption' && (
                    <div className="flex items-center gap-2 mb-2 text-blue-400">
                      <Info className="w-4 h-4" />
                      <span className="text-sm font-medium">Based on your patterns</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </div>
                </div>

                {/* Action buttons for plan messages */}
                {message.type === 'plan' && pendingPlan && (
                  <div className="mt-3 flex gap-2 justify-start">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleApplyPlan}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Apply Plan
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => inputRef.current?.focus()}
                    >
                      Request Changes
                    </Button>
                  </div>
                )}

                <div className="text-xs text-dark-500 mt-1">
                  {format(message.timestamp, 'h:mm a')}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="mt-4 relative">
        <Textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tell me about your tasks for today..."
          className="pr-12 min-h-[80px] resize-none"
          disabled={isLoading}
        />
        <Button
          variant="primary"
          size="sm"
          className="absolute right-3 bottom-3"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Learned Patterns Info */}
      {patterns.length > 0 && (
        <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
          <Info className="w-3 h-3" />
          <span>
            I've learned {patterns.length} pattern{patterns.length !== 1 ? 's' : ''} about your preferences
          </span>
        </div>
      )}
    </div>
  );
}
