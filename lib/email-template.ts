import type { BriefingContent } from "./types";

function esc(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function planToHtml(md: string): string {
  const lines = (md || "").split(/\r?\n/);
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const t = raw.trim();
    const isBullet = /^[-*]\s+/.test(t);
    if (isBullet) {
      if (!inList) {
        html += '<ul style="margin:6px 0 6px 18px;padding:0;">';
        inList = true;
      }
      html += `<li style="margin:3px 0;line-height:1.5;">${esc(
        t.replace(/^[-*]\s+/, "")
      )}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      if (!t) continue;
      if (t.startsWith("## "))
        html += `<h3 style="margin:16px 0 6px;font-size:15px;color:#111827;">${esc(
          t.slice(3)
        )}</h3>`;
      else if (t.startsWith("# "))
        html += `<h2 style="margin:16px 0 6px;font-size:17px;color:#111827;">${esc(
          t.slice(2)
        )}</h2>`;
      else
        html += `<p style="margin:6px 0;line-height:1.5;color:#374151;">${esc(
          t
        )}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

function listBlock(title: string, items: string[]): string {
  if (!items || items.length === 0) return "";
  const lis = items
    .map(
      (i) =>
        `<li style="margin:4px 0;line-height:1.5;color:#374151;">${esc(i)}</li>`
    )
    .join("");
  return `<h3 style="margin:18px 0 6px;font-size:15px;color:#111827;">${esc(
    title
  )}</h3><ul style="margin:6px 0 6px 18px;padding:0;">${lis}</ul>`;
}

export function renderBriefingHtml(
  c: BriefingContent,
  dateLabel: string
): string {
  const priorities =
    c.priorities && c.priorities.length
      ? `<h3 style="margin:18px 0 6px;font-size:15px;color:#111827;">A traiter</h3><ul style="margin:6px 0 6px 18px;padding:0;">${c.priorities
          .map(
            (p) =>
              `<li style="margin:6px 0;line-height:1.5;color:#374151;"><strong>${esc(
                p.title
              )}</strong>${p.why ? ` — ${esc(p.why)}` : ""}</li>`
          )
          .join("")}</ul>`
      : "";

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:8px 4px;color:#111827;">
  <p style="font-size:15px;margin:0 0 14px;">${esc(c.greeting)}</p>
  <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:8px;margin-bottom:8px;">
    <span style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#b45309;">Focus du jour</span>
    <div style="font-size:15px;margin-top:4px;color:#111827;">${esc(c.focus)}</div>
  </div>
  <h3 style="margin:18px 0 6px;font-size:15px;color:#111827;">Ton plan</h3>
  ${planToHtml(c.plan)}
  ${priorities}
  ${listBlock("Tes objectifs", c.goalReminders)}
  ${listBlock("Tes habitudes", c.habitNudges)}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0 10px;" />
  <p style="font-size:12px;color:#9ca3af;margin:0;">Briefing genere automatiquement par ton assistant — ${esc(
    dateLabel
  )}.</p>
</div>`;
}
