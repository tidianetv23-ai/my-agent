// Lecture des variables d'environnement (au runtime, jamais au build).
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const TIMEZONE = (): string => process.env.TIMEZONE || "Europe/Paris";
export const ANTHROPIC_MODEL = (): string =>
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
