export type Goal = {
  id: number;
  title: string;
  detail: string | null;
  created_at: string;
};

export type Habit = {
  id: number;
  name: string;
  cadence: string;
  created_at: string;
};

export type HabitWithLogs = Habit & {
  done_last_7: number;
  logged_days: string[]; // dates "YYYY-MM-DD"
};

export type Briefing = {
  id: number;
  date_label: string;
  content: BriefingContent;
  created_at: string;
};

export type BriefingContent = {
  greeting: string;
  focus: string;
  plan: string; // markdown
  priorities: { title: string; why: string }[];
  goalReminders: string[];
  habitNudges: string[];
};
