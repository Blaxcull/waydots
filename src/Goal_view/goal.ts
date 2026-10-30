import type { LucideIcon } from "lucide-react";
import { BookOpen, Brain, Code2, DollarSign, Dumbbell, Music4, Paintbrush2, PenLine, PersonStanding, Salad, TimerReset, Zap } from "lucide-react";

export interface Goal {
  id: string;
  name: string;
  color: string;
  targetValue: number;
  targetPeriod: 'day' | 'week' | 'month' | 'year';
  status: 'active' | 'paused' | 'completed';
  description?: string;
  icon?: string;
}

export const GOAL_COLORS = [
  { label: 'None', value: '', emoji: 'Ø' },
  { label: 'Red', value: '0 84% 60%', emoji: '🔴' },
  { label: 'Yellow', value: '48 96% 53%', emoji: '🟡' },
  { label: 'Blue', value: '217 91% 60%', emoji: '🔵' },
  { label: 'Green', value: '142 71% 45%', emoji: '🟢' },
  { label: 'Purple', value: '270 67% 47%', emoji: '🟣' },
  { label: 'Orange', value: '25 95% 53%', emoji: '🟠' },
];

export const GOAL_ICONS = [
  { value: "", label: "None" },
  { value: "fitness", label: "Fitness", icon: Dumbbell },
  { value: "learning", label: "Learning", icon: BookOpen },
  { value: "money", label: "Money", icon: DollarSign },
  { value: "mindfulness", label: "Mindfulness", icon: PersonStanding },
  { value: "running", label: "Running", icon: Zap },
  { value: "coding", label: "Coding", icon: Code2 },
  { value: "music", label: "Music", icon: Music4 },
  { value: "art", label: "Art", icon: Paintbrush2 },
  { value: "writing", label: "Writing", icon: PenLine },
  { value: "nutrition", label: "Nutrition", icon: Salad },
  { value: "rest", label: "Rest", icon: TimerReset },
  { value: "focus", label: "Focus", icon: Brain },
] satisfies Array<{ value: string; label: string; icon?: LucideIcon }>;

const LEGACY_ICON_MAP: Record<string, string> = {
  "🏋️": "fitness",
  "📚": "learning",
  "💰": "money",
  "🧘": "mindfulness",
  "🏃": "running",
  "💻": "coding",
  "🎵": "music",
  "🎨": "art",
  "✍️": "writing",
  "🥗": "nutrition",
  "💤": "rest",
  "🧠": "focus",
};

export const DEFAULT_GOAL_ICON = "";

export const normalizeGoalIcon = (icon?: string) => {
  if (!icon) return DEFAULT_GOAL_ICON;
  return LEGACY_ICON_MAP[icon] ?? icon;
};

export const getGoalIcon = (icon?: string) => {
  const normalized = normalizeGoalIcon(icon);
  return GOAL_ICONS.find((entry) => entry.value === normalized && entry.icon) ?? GOAL_ICONS[1];
};
