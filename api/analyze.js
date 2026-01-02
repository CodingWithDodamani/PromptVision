// Vercel Serverless Function - Secure Gemini API Proxy
// API key is stored in Vercel Environment Variables (never exposed to frontend)
// Includes rate limiting to prevent abuse

// ===== RATE LIMITING CONFIG =====
const RATE_LIMIT = {
    MAX_REQUESTS_PER_DAY: 15,      // Max requests per IP per day
    MAX_REQUESTS_PER_HOUR: 5,       // Max requests per IP per hour
    MAX_GLOBAL_PER_DAY: 500         // Max total requests per day (all users)
};

// In-memory store (resets on cold start, but good enough for basic protection)
const rateLimitStore = {
    ips: new Map(),
    global: { count: 0, resetTime: Date.now() + 86400000 }
};

// Check rate limit for an IP
function checkRateLimit(ip) {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;

    // Reset global counter daily
    if (now > rateLimitStore.global.resetTime) {
        rateLimitStore.global = { count: 0, resetTime: now + dayMs };
    }

    // Check global limit
    if (rateLimitStore.global.count >= RATE_LIMIT.MAX_GLOBAL_PER_DAY) {
        return { allowed: false, reason: 'Daily limit reached. Try again tomorrow.', remaining: 0 };
    }

    // Get or create IP record
    let record = rateLimitStore.ips.get(ip);
    if (!record) {
        record = {
            hourCount: 0,
            dayCount: 0,
            hourReset: now + hourMs,
            dayReset: now + dayMs
        };
        rateLimitStore.ips.set(ip, record);
    }

    // Reset hourly counter
    if (now > record.hourReset) {
        record.hourCount = 0;
        record.hourReset = now + hourMs;
    }

    // Reset daily counter
    if (now > record.dayReset) {
        record.dayCount = 0;
        record.dayReset = now + dayMs;
    }

    // Check hourly limit
    if (record.hourCount >= RATE_LIMIT.MAX_REQUESTS_PER_HOUR) {
        const waitMinutes = Math.ceil((record.hourReset - now) / 60000);
        return {
            allowed: false,
            reason: `Hourly limit reached. Try again in ${waitMinutes} minutes.`,
            remaining: 0
        };
    }

    // Check daily limit
    if (record.dayCount >= RATE_LIMIT.MAX_REQUESTS_PER_DAY) {
        return {
            allowed: false,
            reason: 'Daily limit reached. Try again tomorrow.',
            remaining: 0
        };
    }

    // Increment counters
    record.hourCount++;
    record.dayCount++;
    rateLimitStore.global.count++;

    return {
        allowed: true,
        remaining: RATE_LIMIT.MAX_REQUESTS_PER_DAY - record.dayCount
    };
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get client IP
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        'unknown';

    // Check rate limit
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            message: rateCheck.reason,
            retryAfter: '1 hour'
        });
    }

    try {
        const { imageData } = req.body;

        if (!imageData) {
            return res.status(400).json({ error: 'No image data provided' });
        }

        // Get API key from environment variable (secure, not exposed)
        const apiKey = process.env.GEMINI_API_KEY;

        // Debug: Log if API key exists (not the actual key for security)
        console.log('API Key configured:', apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No');

        // If no API key, return demo response with clear indicator
        if (!apiKey) {
            const DEMO_RESPONSES = [
                {
                    prompt: "cinematic portrait of a cyberpunk street samurai, neon lights reflecting off rain-slicked streets, highly detailed, 8k resolution, octane render, unreal engine 5, volumetric lighting --ar 16:9 --v 5.2",
                    negativePrompt: "blurry, low quality, distorted, bad anatomy, watermark, text, signature",
                    model: "Midjourney v5.2",
                    confidence: 94,
                    style: "Cyberpunk, Cinematic",
                    tags: ["cyberpunk", "portrait", "neon", "cinematic"]
                },
                {
                    prompt: "ethereal fantasy landscape with floating islands, bioluminescent plants, magical aurora in the sky, studio ghibli style, soft watercolor textures, dreamy atmosphere --ar 16:9 --v 5",
                    negativePrompt: "realistic, photograph, harsh lighting, modern elements",
                    model: "Midjourney v5",
                    confidence: 87,
                    style: "Fantasy, Anime",
                    tags: ["fantasy", "landscape", "ghibli", "magical"]
                },
                {
                    prompt: "hyperrealistic close-up of a mechanical eye, intricate gears and circuits visible, golden and brass tones, macro photography style, dramatic lighting, steampunk aesthetic",
                    negativePrompt: "organic, blurry, low detail, cartoon",
                    model: "Stable Diffusion XL",
                    confidence: 91,
                    style: "Steampunk, Macro",
                    tags: ["steampunk", "macro", "mechanical", "detailed"]
                }
            ];

            const demoResult = DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];
            return res.status(200).json({
                ...demoResult,
                isDemoMode: true,
                _remaining: 999, // Demo mode has unlimited "requests"
                _debug: 'No GEMINI_API_KEY environment variable found'
            });
        }

        // Call Gemini API
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: `Analyze this AI-generated image and provide:
1. The likely prompt used to generate it (be detailed)
2. Negative prompt (what was likely excluded)
3. The AI model used (Midjourney, DALL-E, Stable Diffusion, etc.)
4. Confidence percentage (0-100)
5. Art style
6. 3-5 relevant tags

Respond in JSON format:
{
  "prompt": "...",
  "negativePrompt": "...",
  "model": "...",
  "confidence": 90,
  "style": "...",
  "tags": ["...", "..."]
}`
                            },
                            {
                                inline_data: {
                                    mime_type: 'image/png',
                                    data: imageData
                                }
                            }
                        ]
                    }]
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('Gemini API error:', data);
            return res.status(500).json({ error: 'Gemini API error', details: data.error?.message });
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            return res.status(500).json({ error: 'No response from Gemini' });
        }

        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            // Add remaining requests info and indicate this is real API
            result._remaining = rateCheck.remaining;
            result.isDemoMode = false;
            return res.status(200).json(result);
        }

        return res.status(500).json({ error: 'Could not parse Gemini response' });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ error: 'Server error', message: error.message });
    }
}
