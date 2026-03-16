/**
 * Gemini Service — Calls the Cloudflare Worker proxy instead of Gemini directly.
 * The API key is secured server-side in the worker.
 */

const API_BASE = import.meta.env.PROD
  ? 'https://claims-assistant-api.bill-7e3.workers.dev'
  : 'http://localhost:8787';

export async function analyzeImage(base64Data: string, mimeType: string) {
  const resp = await fetch(`${API_BASE}/api/analyze-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: base64Data, mimeType }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Image analysis failed: ${err}`);
  }

  return resp.json();
}

export async function estimateMultipleItemsValues(items: any[]) {
  // Map items to the format the worker expects
  const workerItems = items.map(item => ({
    id: item.id,
    description: item.description,
    brand: item.brand || '',
    model: item.model || '',
    ageYears: item.ageYears,
    condition: item.condition,
    imageData: item.image?.data,
    mimeType: item.image?.mimeType,
  }));

  const resp = await fetch(`${API_BASE}/api/estimate-values`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: workerItems }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Value estimation failed: ${err}`);
  }

  return resp.json();
}

export async function estimateItemValue(
  description: string,
  brand: string,
  model: string,
  ageYears: number,
  condition: string,
  imageBase64?: string,
  mimeType?: string
) {
  const items = [{
    id: 'single',
    description,
    brand,
    model,
    ageYears,
    condition,
    imageData: imageBase64,
    mimeType,
  }];

  const resp = await fetch(`${API_BASE}/api/estimate-values`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Value estimation failed: ${err}`);
  }

  const results = await resp.json();
  return results[0] || {};
}
