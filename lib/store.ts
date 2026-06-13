import { db } from "./supabase";
import type { Goal, Habit, HabitWithLogs } from "./types";

// --- Objectifs ---
export async function getGoals(): Promise<Goal[]> {
  const { data, error } = await db()
    .from("goals")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as Goal[];
}

export async function addGoal(title: string, detail: string): Promise<void> {
  const { error } = await db()
    .from("goals")
    .insert({ title, detail: detail || null });
  if (error) throw new Error(error.message);
}

export async function deleteGoal(id: number): Promise<void> {
  const { error } = await db().from("goals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// --- Habitudes ---
export async function getHabits(): Promise<Habit[]> {
  const { data, error } = await db()
    .from("habits")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as Habit[];
}

export async function addHabit(name: string, cadence: string): Promise<void> {
  const { error } = await db()
    .from("habits")
    .insert({ name, cadence: cadence || "quotidienne" });
  if (error) throw new Error(error.message);
}

export async function deleteHabit(id: number): Promise<void> {
  const { error } = await db().from("habits").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Coche / decoche une habitude pour un jour donne ("YYYY-MM-DD").
export async function toggleHabitLog(
  habitId: number,
  day: string
): Promise<void> {
  const { data } = await db()
    .from("habit_logs")
    .select("id")
    .eq("habit_id", habitId)
    .eq("day", day)
    .maybeSingle();
  if (data) {
    await db().from("habit_logs").delete().eq("id", data.id);
  } else {
    await db().from("habit_logs").insert({ habit_id: habitId, day });
  }
}

export async function getHabitsWithLogs(): Promise<HabitWithLogs[]> {
  const habits = await getHabits();
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: logs } = await db()
    .from("habit_logs")
    .select("habit_id, day")
    .gte("day", sinceStr);

  const byHabit = new Map<number, string[]>();
  for (const l of logs || []) {
    const arr = byHabit.get(l.habit_id) || [];
    arr.push(l.day);
    byHabit.set(l.habit_id, arr);
  }
  return habits.map((h) => ({
    ...h,
    done_last_7: (byHabit.get(h.id) || []).length,
    logged_days: byHabit.get(h.id) || [],
  }));
}

// --- Briefings ---
export async function getLatestBriefing() {
  const { data } = await db()
    .from("briefings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
