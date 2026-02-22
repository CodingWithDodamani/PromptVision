// Vercel Serverless Function - Secure Gemini API Proxy
// API key is stored in Vercel Environment Variables (never exposed to frontend)
// Includes persistent rate limiting with Upstash Redis

// ===== RATE LIMITING CONFIG =====
const RATE_LIMIT = {
    MAX_REQUESTS_PER_DAY: 15,
    MAX_REQUESTS_PER_HOUR: 5,
    MAX_GLOBAL_PER_DAY: 500
};

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
    'https://codingwithdodamani.github.io',
    'https://promptvision-ai.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500'
];

// Initialize Redis client (Upstash)
// Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel env vars
let redis = null;

function getRedisClient() {
    if (redis) return redis;
    
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
        return null;
    }
    
    redis = {
        async get(key) {
            const res = await fetch(`${url}/get/${key}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            return data.result ? JSON.parse(data.result) : null;
        },
        async set(key, value, ex = null) {
            const body = ex 
                ? `EX ${ex} "${JSON.stringify(value)}"`
                : `"${JSON.stringify(value)}"`;
            const res = await fetch(`${url}/set/${key}`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: body
            });
            return res.json();
        },
        async incr(key) {
            const res = await fetch(`${url}/incr/${key}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            return parseInt(data.result) || 0;
        },
        async expire(key, seconds) {
            await fetch(`${url}/expire/${key}/${seconds}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
    };
    
    return redis;
}

// In-memory fallback for when Redis is not configured
const memoryStore = {
    ips: new Map(),
    global: { count: 0, resetTime: Date.now() + 86400000 }
};

// Check rate limit for an IP (supports both Redis and in-memory)
async function checkRateLimit(ip) {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;
    const hourKey = Math.floor(now / hourMs);
    const dayKey = Math.floor(now / dayMs);

    const redisClient = getRedisClient();

    // Use Redis if available
    if (redisClient) {
        try {
            const hourCountKey = `rl:${ip}:hour:${hourKey}`;
            const dayCountKey = `rl:${ip}:day:${dayKey}`;
            const globalKey = `rl:global:${dayKey}`;

            // Increment and get counts
            const [hourCount, dayCount, globalCount] = await Promise.all([
                redisClient.incr(hourCountKey),
                redisClient.incr(dayCountKey),
                redisClient.incr(globalKey)
            ]);

            // Set expiry for keys (1 hour for hourly, 24 hours for daily)
            if (hourCount === 1) await redisClient.expire(hourCountKey, 3600);
            if (dayCount === 1) await redisClient.expire(dayCountKey, 86400);
            if (globalCount === 1) await redisClient.expire(globalKey, 86400);

            // Check global limit
            if (globalCount > RATE_LIMIT.MAX_GLOBAL_PER_DAY) {
                return { allowed: false, reason: 'Daily global limit reached. Try again tomorrow.', remaining: 0 };
            }

            // Check hourly limit
            if (hourCount > RATE_LIMIT.MAX_REQUESTS_PER_HOUR) {
                return { allowed: false, reason: 'Hourly limit reached. Try again in about an hour.', remaining: 0 };
            }

            // Check daily limit
            if (dayCount > RATE_LIMIT.MAX_REQUESTS_PER_DAY) {
                return { allowed: false, reason: 'Daily limit reached. Try again tomorrow.', remaining: 0 };
            }

            return {
                allowed: true,
                remaining: Math.max(0, RATE_LIMIT.MAX_REQUESTS_PER_DAY - dayCount)
            };
        } catch (err) {
            console.error('Redis error, falling back to memory:', err.message);
            // Fall through to in-memory fallback
        }
    }

    // In-memory fallback (resets on cold start)
    if (now > memoryStore.global.resetTime) {
        memoryStore.global = { count: 0, resetTime: now + dayMs };
    }

    if (memoryStore.global.count >= RATE_LIMIT.MAX_GLOBAL_PER_DAY) {
        return { allowed: false, reason: 'Daily limit reached. Try again tomorrow.', remaining: 0 };
    }

    let record = memoryStore.ips.get(ip);
    if (!record) {
        record = { hourCount: 0, dayCount: 0, hourReset: now + hourMs, dayReset: now + dayMs };
        memoryStore.ips.set(ip, record);
    }

    if (now > record.hourReset) {
        record.hourCount = 0;
        record.hourReset = now + hourMs;
    }
    if (now > record.dayReset) {
        record.dayCount = 0;
        record.dayReset = now + dayMs;
    }

    if (record.hourCount >= RATE_LIMIT.MAX_REQUESTS_PER_HOUR) {
        const waitMinutes = Math.ceil((record.hourReset - now) / 60000);
        return { allowed: false, reason: `Hourly limit reached. Try again in ${waitMinutes} minutes.`, remaining: 0 };
    }

    if (record.dayCount >= RATE_LIMIT.MAX_REQUESTS_PER_DAY) {
        return { allowed: false, reason: 'Daily limit reached. Try again tomorrow.', remaining: 0 };
    }

    record.hourCount++;
    record.dayCount++;
    memoryStore.global.count++;

    return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS_PER_DAY - record.dayCount };
}

// Validate base64 image data
function validateImageData(data) {
    if (!data || typeof data !== 'string') {
        return { valid: false, error: 'No image data provided' };
    }
    if (data.length > 10 * 1024 * 1024) {
        return { valid: false, error: 'Image too large (max 10MB)' };
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) {
        return { valid: false, error: 'Invalid base64 format' };
    }
    return { valid: true };
}

// Demo responses for when API key is not configured
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

export default async function handler(req, res) {
    // Enable CORS (restrict to allowed origins)
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
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

    // Check rate limit (now async for Redis)
    const rateCheck = await checkRateLimit(ip);
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

        // Validate image data
        const validation = validateImageData(imageData);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        // Get API key from environment variable (secure, not exposed)
        const apiKey = process.env.GEMINI_API_KEY;

        // If no API key, return demo response
        if (!apiKey) {
            const demoResult = DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];
            return res.status(200).json({
                ...demoResult,
                isDemoMode: true,
                _remaining: 999,
                _rateLimitBackend: getRedisClient() ? 'redis' : 'memory'
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
