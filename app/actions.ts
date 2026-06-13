"use server";

import { revalidatePath } from "next/cache";
import {
  addGoal,
  deleteGoal,
  addHabit,
  deleteHabit,
  toggleHabitLog,
} from "@/lib/store";
import { runDailyBriefing } from "@/lib/briefing";
import { TIMEZONE } from "@/lib/env";

function todayInTz(): string {
  // "YYYY-MM-DD" dans le fuseau configure
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE() }).format(
    new Date()
  );
}

export async function createGoal(title: string, detail: string) {
  if (!title.trim()) return;
  await addGoal(title.trim(), detail.trim());
  revalidatePath("/");
}

export async function removeGoal(id: number) {
  await deleteGoal(id);
  revalidatePath("/");
}

export async function createHabit(name: string, cadence: string) {
  if (!name.trim()) return;
  await addHabit(name.trim(), cadence);
  revalidatePath("/");
}

export async function removeHabit(id: number) {
  await deleteHabit(id);
  revalidatePath("/");
}

export async function toggleHabit(id: number) {
  await toggleHabitLog(id, todayInTz());
  revalidatePath("/");
}

export async function runBriefingNow() {
  const res = await runDailyBriefing();
  revalidatePath("/");
  return res;
}
