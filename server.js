/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║          FORGE AI — Private Backend AI Server           ║
 * ║  Node.js + Express + Groq API (100% Free Tier)         ║
 * ║  Model: qwen-2.5-coder-32b or llama-3.3-70b-versatile ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * SETUP:
 *   1. npm install
 *   2. Create .env file with your GROQ_API_KEY
 *   3. node server.js
 *
 * DEPLOY TO RENDER (free):
 *   1. Push to GitHub
 *   2. New Web Service on render.com → connect repo
 *   3. Set GROQ_API_KEY in environment variables
 *   4. Deploy — get your public URL
 *
 * GET FREE GROQ KEY: https://console.groq.com
 */

const express    = require('express');
const cors       = require('cors');
const Groq       = require('groq-sdk');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Groq client ───────────────────────────────────────────
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Model priority list (Groq free tier)
const MODELS = [
  'qwen-2.5-coder-32b',        // Best for code generation
  'llama-3.3-70b-versatile',   // Fallback — fast & capable
  'llama3-70b-8192',           // Last resort
];

// ─── Middleware ─────────────────────────────────────────────
app.use(cors({
  origin: '*', // Allow any frontend (lock down in production)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── System Instruction ─────────────────────────────────────
const SYSTEM_PROMPT = `You are FORGE AI — the world's most elite full-stack frontend developer.

YOUR ONLY JOB: Generate a complete, fully-functional, beautiful single-file HTML application based on the user's prompt.

ABSOLUTE RULES — NEVER BREAK THESE:
1. Output ONLY raw HTML code. Start with <!DOCTYPE html> and end with </html>.
2. ZERO markdown. ZERO backticks. ZERO explanations. ZERO comments to the user.
3. ALL CSS must be inside a <style> tag in the <head>.
4. ALL JavaScript must be inside a <script> tag before </body>.
5. No external dependencies EXCEPT you may use these CDNs when needed:
   - Three.js: https://cdn.jsdelivr.net/npm/three@0.157/build/three.min.js
   - Chart.js:  https://cdn.jsdelivr.net/npm/chart.js
   - Anime.js:  https://cdn.jsdelivr.net/npm/animejs@3/lib/anime.min.js

DESIGN STANDARDS:
- Dark themes: backgrounds #0a0a0f or #09090b (near black)
- Typography: system fonts or Google Fonts via @import
- Accent colors: neon pink (#f72585), electric blue (#4361ee), cyber cyan (#4cc9f0)
- Glassmorphism: backdrop-filter: blur(12px) + rgba borders
- Smooth animations: CSS transitions, requestAnimationFrame for games
- Fully mobile-responsive: flexbox/grid, proper viewport meta
- High pixel density quality — looks like a shipped product

FOR GAMES:
- Fully playable with keyboard AND touch controls
- Score tracking, lives, levels
- Game over + restart flow
- Smooth 60fps animation loop

FOR APPS/TOOLS:
- All buttons and inputs are functional
- Real working logic (calculators compute, timers count, etc.)
- Beautiful empty states and loading states
- No placeholder lorem ipsum

OUTPUT FORMAT: Start your response with <!DOCTYPE html> and output NOTHING else.`;

// ─── Routes ─────────────────────────────────────────────────

/**
 * GET /health
 * Frontend uses this to check if the server is alive.
 */
app.get('/health', (req, res) => {
  res.json({
    status : 'online',
    model  : MODELS[0],
    engine : 'Groq API',
    uptime : Math.floor(process.uptime()) + 's',
    version: '1.0.0',
  });
});

/**
 * POST /api/forge
 * Main generation endpoint.
 * Body: { prompt: string }
 * Returns: { code: string }
 */
app.post('/api/forge', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 2) {
    return res.status(400).json({ error: 'A valid prompt is required.' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      error: 'GROQ_API_KEY is not set. Add it to your .env file or Render environment variables.',
    });
  }

  console.log(`\n⚡ [FORGE] Prompt: "${prompt.substring(0, 80)}..."`);
  const startTime = Date.now();

  // Try models in order until one succeeds
  let lastError = null;

  for (const model of MODELS) {
    try {
      console.log(`   ↳ Trying model: ${model}`);

      const completion = await groq.chat.completions.create({
        model,
        messages: [
          {
            role   : 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role   : 'user',
            content: prompt.trim(),
          },
        ],
        temperature      : 0.7,
        max_tokens       : 8192,
        top_p            : 0.95,
        stream           : false,
        stop             : null,
      });

      const rawCode = completion.choices?.[0]?.message?.content || '';

      if (!rawCode || rawCode.trim().length < 100) {
        throw new Error('Model returned empty or too-short response.');
      }

      // Clean up the response — strip any accidental markdown fences
      const code = stripMarkdown(rawCode);

      // Validate it looks like HTML
      if (!/<!doctype html|<html/i.test(code)) {
        throw new Error('Model did not return valid HTML — retrying with next model.');
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const lines   = code.split('\n').length;
      console.log(`   ✅ Success: ${lines} lines, ${elapsed}s [${model}]`);

      return res.json({
        code,
        meta: {
          model,
          lines,
          elapsed : elapsed + 's',
          chars   : code.length,
        },
      });

    } catch (err) {
      lastError = err;
      const msg = err?.error?.message || err.message || 'Unknown error';
      console.warn(`   ⚠ Model ${model} failed: ${msg}`);

      // Rate limit — wait before retrying
      if (err?.status === 429) {
        console.log('   ↳ Rate limited, waiting 2s...');
        await new Promise(r => setTimeout(r, 2000));
      }
      continue;
    }
  }

  // All models failed
  const errMsg = lastError?.error?.message || lastError?.message || 'All models failed.';
  console.error(`   ❌ All models failed: ${errMsg}`);

  if (lastError?.status === 401) {
    return res.status(401).json({ error: 'Invalid GROQ_API_KEY. Check your credentials.' });
  }
  if (lastError?.status === 429) {
    return res.status(429).json({ error: 'Rate limit hit on all models. Try again in a moment.' });
  }

  return res.status(502).json({ error: `AI generation failed: ${errMsg}` });
});

// ─── Helper: strip markdown fences ──────────────────────────
function stripMarkdown(raw) {
  return raw
    .replace(/^```html\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
}

// ─── 404 handler ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── Global error handler ───────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║        FORGE AI Backend Server       ║
╠═══════════════════════════════════════╣
║  ✅ Running on  : http://localhost:${PORT} ║
║  🤖 AI Engine  : Groq API            ║
║  🧠 Model      : ${MODELS[0].padEnd(21)}║
║  🔑 API Key    : ${process.env.GROQ_API_KEY ? '✓ Set' : '✗ MISSING!'} ${' '.repeat(process.env.GROQ_API_KEY ? 15 : 13)}║
╚═══════════════════════════════════════╝

Endpoints:
  GET  /health      → Connection check
  POST /api/forge   → Generate code

${!process.env.GROQ_API_KEY ? '⚠️  WARNING: GROQ_API_KEY is not set!\n   Add it to .env file: GROQ_API_KEY=gsk_...' : ''}
  `);
});
