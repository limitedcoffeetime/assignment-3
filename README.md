## A3: Multi‑agent Interaction

This starter guides you to build a frame‑sensitive multi-agent conversational system in SvelteKit. You will design and implement agents and an orchestrator so the system adapts its tone/genre/goals based on context.

What you implement:
- Agents in `src/lib/agents/*` 
- Orchestrators in `src/lib/orchestrators/*` (also stubbed).

## Setup and Running the App

Install required tools (choose per OS):
- Node.js 20.x (includes npm)
  - macOS: `brew install node` (Homebrew), or download from nodejs.org
  - Windows: install Node LTS from nodejs.org (includes npm)
  - Linux: use your package manager or NodeSource installers
- Git (to clone and manage the repo)
- An editor (Cursor recommended)

Clone and start the app:
- `git clone <your-repo-url>`
- `cd A3-Starter`
- `cp .env.example .env` (you will fill it in Step 1)
- `npm install`
- `npm run dev`
- Open `http://localhost:5173`

At this point, you should have a working app that you can use to chat with the replier; however, the replier will not be able to use the Gemini API because you have not yet added your API key to `.env`.

## Getting Started with the Gemini API

Per the instructions in Canvas, add Google API credits to a personal Google account. 

Important: While you will use your `@mit.edu` email to get a coupon code for Gemini credits, do NOT claim credits using your `@mit.edu` email. Instead, use a personal Google account to avoid institutional billing/limits.

Once you have credits added, you can create an API key in Google AI Studio and add it to `.env`.

Steps:
- Go to Google AI Studio (https://aistudio.google.com/)
- Click Get API Key
- Click Create API Key
- Copy your key and set environment values in `.env`:

```
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

Restart `npm run dev` after changing `.env`.

## Safely Deploy to Vercel

After implementing the agents and orchestrators, you can set up Vercel and deploy your application without exposing secrets.

Reminder: do not commit `.env` or any API keys to Git.

Steps:
- Create a Vercel account and import your GitHub repo as a new project
- In Vercel Project Settings → Environment Variables, add:
  - `GEMINI_API_KEY` 
  - `GEMINI_MODEL` (e.g., `gemini-2.5-flash`)
- Trigger a deploy (Vercel builds and hosts your app)
- Verify the app works at your Vercel URL

Safety reminders:
- Ensure `.env` is in `.gitignore` (already included)
- Never push secrets to Git; use Vercel Environment Variables only
- Optionally rotate keys after testing

## Quick Dev Reference

- Start dev server: `npm run dev` (http://localhost:5173)
- Build: `npm run build`
