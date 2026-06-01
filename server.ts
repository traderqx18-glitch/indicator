import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Twelve Data Keys
const API_KEYS = [
  "89a186fdf7f146bb8759b43d44a35969", // KEY_1
  "c6c4fc937e714fb687f521f6a32819f5", // KEY_2
  "92305c67dcce499ab9103259636f90b0"  // KEY_3
];

let currentKeyIndex = 0;
const keyCooldowns: { [key: string]: number } = {};

function getActiveApiKey(): string {
  const now = Date.now();
  for (let i = 0; i < API_KEYS.length; i++) {
    const idx = (currentKeyIndex + i) % API_KEYS.length;
    const key = API_KEYS[idx];
    const cooldownTime = keyCooldowns[key] || 0;
    if (now > cooldownTime) {
      if (idx !== currentKeyIndex) {
        currentKeyIndex = idx;
        console.log(`[API KEY ROTATE] Switching to API key index ${idx}`);
      }
      return key;
    }
  }
  // If all are on cooldown, return the current one anyway and hope for the best
  return API_KEYS[currentKeyIndex];
}

function handleKeyFailure(key: string) {
  // Set 1 minute cooldown on this key
  keyCooldowns[key] = Date.now() + 60 * 1000;
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  console.warn(`[API KEY FAILURE] Key ${key.substring(0, 5)}... rate limited. Rotating to next key.`);
}

app.use(express.json());

// CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Twelve Data Time Series API Proxy with key rotation & cooldown logic
app.get('/api/twelve-data', async (req, res) => {
  const symbol = req.query.symbol as string;
  let interval = (req.query.interval as string) || '5min';
  
  // Normalize intervals to Twelve Data standard format
  if (interval === '1m') interval = '1min';
  if (interval === '5m') interval = '5min';

  const outputsize = (req.query.outputsize as string) || '5000';

  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol parameter' });
    return;
  }

  let attempts = 0;
  const maxAttempts = API_KEYS.length;

  while (attempts < maxAttempts) {
    const apiKey = getActiveApiKey();
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;

    try {
      console.log(`[Twelve Data Request] Fetching ${symbol} with key index ${currentKeyIndex}`);
      const fetchResponse = await fetch(url);

      if (fetchResponse.status === 429) {
        console.warn(`[Twelve Data Request] Key index ${currentKeyIndex} throttled. 429 Too Many Requests.`);
        handleKeyFailure(apiKey);
        attempts++;
        continue;
      }

      const data = await fetchResponse.json();

      // Some Twelve Data error formats contain status: "error" in body
      if (data && data.status === 'error') {
        console.error(`[Twelve Data Error Response Details]:`, JSON.stringify(data));
        const msg = String(data.message || '').toLowerCase();
        if (msg.includes('limit') || msg.includes('credits') || msg.includes('rate') || msg.includes('plan')) {
          handleKeyFailure(apiKey);
          attempts++;
          continue;
        }
        // General non-rate-limit error (e.g. invalid symbol)
        res.status(400).json(data);
        return;
      }

      // Successful fetch!
      res.json(data);
      return;
    } catch (err: any) {
      console.error(`Error querying Twelve Data with key index ${currentKeyIndex}:`, err.message);
      handleKeyFailure(apiKey);
      attempts++;
    }
  }

  res.status(502).json({ error: 'All Twelve Data API keys are currently rate-limited or exhausted. Please try again in 1 minute.' });
});

// Decide whether we are in dev or prod mode
const isProd = process.env.NODE_ENV === 'production';

async function bootstrap() {
  if (!isProd) {
    console.log('[Server Startup] Running in DEVELOPMENT mode. Loading Vite dev middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    console.log('[Server Startup] Running in PRODUCTION mode. Serving pre-compiled static files...');
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Binary King Fullstack Server] Online and listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Server Boostrap Error] Failed to start:', err);
});
