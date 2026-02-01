/**
 * Rate limiting for ClawSignal
 * Uses KV with TTL for sliding window rate limiting
 */
import { errorResponse } from './utils';
const LIMITS = {
    register: { maxRequests: 5, windowSeconds: 3600 }, // 5 registrations per hour per IP
    send: { maxRequests: 60, windowSeconds: 60 }, // 60 messages per minute per agent
    friend_add: { maxRequests: 20, windowSeconds: 3600 }, // 20 friend requests per hour
    verify: { maxRequests: 10, windowSeconds: 600 }, // 10 verify attempts per 10 min
};
export async function checkRateLimit(env, action, identifier) {
    const config = LIMITS[action];
    if (!config) {
        return { allowed: true, remaining: 999, resetIn: 0 };
    }
    const key = `ratelimit:${action}:${identifier}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - config.windowSeconds;
    // Get current count data
    const data = await env.AGENTS.get(key);
    let requests = [];
    if (data) {
        try {
            requests = JSON.parse(data);
            // Filter to only requests within the window
            requests = requests.filter((ts) => ts > windowStart);
        }
        catch {
            requests = [];
        }
    }
    const remaining = config.maxRequests - requests.length;
    const oldestRequest = requests[0] || now;
    const resetIn = Math.max(0, oldestRequest + config.windowSeconds - now);
    if (requests.length >= config.maxRequests) {
        return { allowed: false, remaining: 0, resetIn };
    }
    // Add this request
    requests.push(now);
    // Store with TTL
    await env.AGENTS.put(key, JSON.stringify(requests), {
        expirationTtl: config.windowSeconds + 60, // Add buffer
    });
    return { allowed: true, remaining: remaining - 1, resetIn };
}
export function rateLimitResponse(resetIn) {
    return errorResponse(`Rate limit exceeded. Try again in ${resetIn} seconds.`, 429);
}
export function getClientIP(request) {
    return request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
        'unknown';
}
