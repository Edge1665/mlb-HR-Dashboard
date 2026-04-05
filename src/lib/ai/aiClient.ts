function getBaseUrl() {
  if (typeof window !== 'undefined') return ''; // browser: relative URL is fine
  // Server-side: need absolute URL
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

export async function callAIEndpoint(endpoint: string, payload: object) {
  try {
    const url = endpoint.startsWith('http') ? endpoint : `${getBaseUrl()}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('API Route Error:', {
        error: data.error,
        details: data.details,
      });
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}
