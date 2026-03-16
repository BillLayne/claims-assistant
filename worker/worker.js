/**
 * Cloudflare Worker — Gemini API Proxy for Claims Assistant
 * Secures the Gemini API key and proxies requests from the frontend.
 *
 * Secrets (set via `wrangler secret put`):
 *   GEMINI_API_KEY — Google Gemini API key
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const ALLOWED_ORIGINS = [
  'https://billlayne.github.io',
  'http://localhost:3000',
  'http://localhost:8092',
  'http://127.0.0.1:3000',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      const body = await request.json();

      if (path === '/api/analyze-image') {
        return await handleAnalyzeImage(body, env, cors);
      } else if (path === '/api/estimate-values') {
        return await handleEstimateValues(body, env, cors);
      } else {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error', message: err.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};

async function callGemini(model, payload, apiKey) {
  const geminiUrl = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errText}`);
  }
  return resp.json();
}

async function handleAnalyzeImage(body, env, cors) {
  const { imageData, mimeType } = body;
  if (!imageData || !mimeType) {
    return new Response(JSON.stringify({ error: 'Missing imageData or mimeType' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const prompt = `Analyze this image (which may be a product photo or a receipt).
Extract or estimate the following details for an insurance claim inventory:
- description: The general type of item (e.g., "Television", "Sofa", "Laptop").
- brand: The brand name, if visible.
- model: The model name or number, if visible.
- ageYears: Estimate the age in years (if it's a receipt, calculate age from purchase date to today. If it's a product, guess the age based on the model/style. Default to 2 if unknown).
- condition: Estimate condition ('Excellent', 'Good', 'Fair', 'Poor'). Default to 'Good'.`;

  const payload = {
    contents: [{
      parts: [
        { inlineData: { data: imageData, mimeType } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
          brand: { type: 'STRING' },
          model: { type: 'STRING' },
          ageYears: { type: 'NUMBER' },
          condition: { type: 'STRING' }
        },
        required: ['description', 'ageYears', 'condition']
      }
    }
  };

  const result = await callGemini('gemini-2.0-flash', payload, env.GEMINI_API_KEY);
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  return new Response(text, {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function handleEstimateValues(body, env, cors) {
  const { items } = body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing or empty items array' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const prompt = `You are an expert insurance claims adjuster assistant.
Find the current average retail price (Replacement Cost) for new, similar items of "Like Kind and Quality".
Also, estimate the typical useful life in years for insurance depreciation purposes.

Return a JSON array of objects. Each object MUST have:
- id: The exact ID of the item from the input.
- currentPrice: The estimated current retail price in USD (number).
- usefulLifeYears: The typical useful life of this item in years (number).
- explanation: A brief explanation of how you determined the price and useful life (string).
`;

  const parts = [{ text: prompt }];
  items.forEach(item => {
    const itemText = `\nItem ID: ${item.id}\nDescription: "${item.description}" (Brand: ${item.brand || 'Unknown'}, Model: ${item.model || 'Unknown'})\nAge: ${item.ageYears} years\nCondition: ${item.condition}\n`;
    parts.push({ text: itemText });
    if (item.imageData && item.mimeType) {
      parts.push({ inlineData: { data: item.imageData, mimeType: item.mimeType } });
    }
  });

  const payload = {
    contents: [{ parts }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING' },
            currentPrice: { type: 'NUMBER' },
            usefulLifeYears: { type: 'NUMBER' },
            explanation: { type: 'STRING' }
          },
          required: ['id', 'currentPrice', 'usefulLifeYears', 'explanation']
        }
      }
    }
  };

  const result = await callGemini('gemini-2.0-flash', payload, env.GEMINI_API_KEY);
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const estimates = JSON.parse(text);

  // Extract grounding source URL if available
  let sourceUrl = '';
  const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks && chunks.length > 0) {
    sourceUrl = chunks[0].web?.uri || '';
  }

  // Calculate ACV for each result
  const withACV = estimates.map(est => {
    const originalItem = items.find(i => i.id === est.id);
    if (!originalItem) return est;

    let depPct = originalItem.ageYears / est.usefulLifeYears;
    depPct = Math.min(depPct, 0.9); // max 90% depreciation
    const acv = est.currentPrice * (1 - depPct);

    return { ...est, acv, sourceUrl };
  });

  return new Response(JSON.stringify(withACV), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
