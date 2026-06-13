# Mon Assistant — agent personnel autonome

Un assistant personnel qui, **chaque matin et tout seul**, lit ton agenda Google et tes mails non lus, croise ça avec tes objectifs et tes habitudes, puis te génère un **briefing du jour** qu'il **t'envoie par email** et affiche sur un petit dashboard.

- **Cerveau** : Claude (API Anthropic)
- **Yeux** : Gmail + Google Agenda (lecture)
- **Bouche** : Gmail (envoi du briefing)
- **Mémoire** : Supabase (objectifs, habitudes, briefings, tokens)
- **Réveil** : Vercel Cron (1×/jour)
- **Stack** : Next.js 15 (App Router, TypeScript) + Tailwind

---

## 1. Ce qu'il te faut (comptes gratuits)

1. Un compte **GitHub** (pour héberger le code).
2. Un compte **Vercel** (déploiement) — connecté à ton GitHub.
3. Un projet **Google Cloud** (OAuth Gmail + Agenda).
4. Un projet **Supabase** (base de données).
5. Une clé **API Anthropic** (https://console.anthropic.com).

---

## 2. Google Cloud — autoriser Gmail + Agenda

1. Va sur https://console.cloud.google.com → crée un projet (ex: `mon-assistant`).
2. **APIs & Services → Library** : active **Gmail API** puis **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** :
   - Type **External**, renseigne le nom de l'app et ton email.
   - **Add users** (Test users) → ajoute **ta propre adresse Gmail**. (Tant que l'app est en mode test, seuls les test users peuvent se connecter — c'est suffisant pour un usage perso.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** :
   - Type **Web application**.
   - **Authorized redirect URIs**, ajoute les deux :
     - `http://localhost:3000/api/auth/callback` (dev local)
     - `https://TON-DOMAINE.vercel.app/api/auth/callback` (à compléter après le 1er déploiement)
   - Récupère le **Client ID** et le **Client secret**.

> Les permissions demandées : lecture Gmail, envoi Gmail, lecture Agenda.

---

## 3. Supabase — la base de données

1. Crée un projet sur https://supabase.com.
2. **SQL Editor → New query** : colle le contenu de `supabase/schema.sql` et clique **Run**.
3. **Project Settings → API** : récupère
   - **Project URL** → `SUPABASE_URL`
   - clé **service_role** (section *Project API keys*) → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ La clé `service_role` contourne toutes les sécurités. Elle ne doit **jamais** être exposée côté navigateur. Ici elle n'est utilisée que côté serveur (routes API + server actions), donc c'est OK.

---

## 4. Les variables d'environnement

Copie `.env.example` en `.env.local` pour le dev, et renseigne :

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Ta clé API Anthropic |
| `ANTHROPIC_MODEL` | (optionnel) défaut `claude-sonnet-4-6` |
| `GOOGLE_CLIENT_ID` | Client ID OAuth |
| `GOOGLE_CLIENT_SECRET` | Client secret OAuth |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role |
| `CRON_SECRET` | Chaîne aléatoire longue (protège le cron) |
| `TIMEZONE` | `Europe/Paris` |
| `BRIEFING_RECIPIENT` | (optionnel) email destinataire ; défaut = compte Google connecté |

---

## 5. Lancer en local

```bash
npm install
npm run dev
```

Ouvre http://localhost:3000, clique **Connecter Google**, autorise l'accès, puis ajoute quelques objectifs et habitudes. Clique **Lancer le briefing** pour tester immédiatement.

---

## 6. Déployer sur Vercel

1. Pousse le projet sur un dépôt GitHub.
2. Sur Vercel : **Add New → Project → Import** ton dépôt.
3. **Environment Variables** : ajoute toutes les variables du tableau ci-dessus.
4. **Deploy**. Note ton domaine, ex: `https://mon-assistant.vercel.app`.
5. Retourne dans **Google Cloud → Credentials** et ajoute ce domaine dans les *Authorized redirect URIs* :
   `https://mon-assistant.vercel.app/api/auth/callback`
6. **Redéploie** (ou attends la propagation), puis ouvre ton domaine et clique **Connecter Google**.

### Le cron (briefing automatique)

- Il est déclaré dans `vercel.json` :
  ```json
  { "crons": [{ "path": "/api/cron/daily-briefing", "schedule": "0 5 * * *" }] }
  ```
- **Important : Vercel tourne en UTC.** `0 5 * * *` = **07h00 à Paris en été** (UTC+2) et **06h00 en hiver** (UTC+1). Ajuste l'heure selon la saison si tu veux 7h pile toute l'année.
- **Plan gratuit (Hobby)** : le cron tourne **1×/jour maximum**, et le déclenchement est approximatif (dans l'heure qui suit). Pour plusieurs fois par jour ou une heure précise, il faut le plan Pro (ou un planificateur externe).
- Vercel ajoute automatiquement l'en-tête `Authorization: Bearer <CRON_SECRET>` à l'appel : la route le vérifie pour empêcher n'importe qui de déclencher ton briefing.

---

## 7. Comment ça marche (en une image)

```
                 ┌──────────────────────┐
   Vercel Cron → │  /api/cron/daily-...  │
   (1x/jour)     └──────────┬───────────┘
                            │
                            ▼
                   lib/briefing.ts  ── lit ─▶ Gmail (mails non lus 24h)
                            │        ── lit ─▶ Agenda (events du jour)
                            │        ── lit ─▶ Supabase (objectifs, habitudes)
                            ▼
                     lib/claude.ts  ── génère le briefing (JSON)
                            │
              ┌─────────────┼──────────────┐
              ▼                            ▼
     Supabase (briefings)        Gmail (envoi du briefing)
              │
              ▼
     Dashboard (/)  ◀── tu consultes, coches tes habitudes, édites tes objectifs
```

---

## 8. Sécurité & bonnes pratiques

- La clé `service_role` et les secrets restent **côté serveur** (jamais dans le navigateur).
- Toutes les modifications (objectifs, habitudes, lancer le briefing) passent par des **server actions**, pas par des routes API publiques.
- Les seules routes publiques sont l'OAuth (Google redirige dessus) et le cron (protégé par `CRON_SECRET`).
- Scopes Google minimaux : lecture mails + lecture agenda + envoi mail.

---

## 9. Personnaliser

- **Le ton / le contenu du briefing** : `lib/claude.ts` (le prompt `SYSTEM`).
- **Quels mails on lit** : `lib/google.ts`, la requête `q` dans `getRecentImportantEmails` (ex: `is:important`, `from:...`, `category:primary`).
- **Le design** : `app/Dashboard.tsx` + `tailwind.config.ts` (couleurs `sun`).
- **L'heure du briefing** : `vercel.json` (en UTC).
- **Le modèle Claude** : variable `ANTHROPIC_MODEL`.

Bon build. 🌅
