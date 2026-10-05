import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API Route for Guardian Analyst with Gemini 2.5 Flash
app.post('/api/analyst', async (req, res) => {
  const { query, context } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.json({
      fallback: true,
      reason: 'No GEMINI_API_KEY configured in environment.',
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Format concise context for Gemini
    const sitesSummary = (context?.sites || [])
      .map(
        (s: any) =>
          `- ${s.name} (${s.type || 'site'}): Risk Score ${s.score}/100 [Tier: ${s.tier}], Lifeguards: ${
            s.lifeguardPresent ? 'Patrolled' : 'None'
          }, Wave: ${s.environmentalFactors?.waveHeight ?? 'N/A'}m, Wind: ${
            s.environmentalFactors?.windSpeed ? Math.round(s.environmentalFactors.windSpeed) : 'N/A'
          }km/h, Rain: ${s.environmentalFactors?.precipitation ?? 0}mm`
      )
      .join('\n');

    const prompt = `You are GuardianGrid Analyst, an environmental risk intelligence expert for civil water-body safety (beaches, lakes, rivers, reservoirs).
You base all reasoning on verified live meteorological and marine observations.
Never invent data or risk numbers. Always use the following verified site data:

CURRENT ACTIVE SITES:
${sitesSummary}

USER QUERY:
"${query}"

GUIDELINES:
- Address the user directly, concise and professional.
- State exact risk scores and risk tiers from the data above.
- Mention whether certified lifeguards are present.
- Provide a clear recreational safety recommendation (e.g. Safe, Caution, or Do Not Enter).
- Keep response under 300 words.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
    });

    const text = response.text || 'Unable to generate analysis.';

    return res.json({
      text,
      modelUsed: 'gemini-2.5-flash-lite',
      isRuleBased: false,
    });
  } catch (error: any) {
    console.error('Gemini Analyst error:', error?.message);
    return res.json({
      fallback: true,
      error: error?.message || 'Gemini API call failed',
    });
  }
});

// Production or Vite Dev Middleware
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const portNumber = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
  app.listen(portNumber || 3000, '0.0.0.0', () => {
    console.log(`GuardianGrid Server running on http://0.0.0.0:${portNumber || 3000}`);
  });
}

startServer();
