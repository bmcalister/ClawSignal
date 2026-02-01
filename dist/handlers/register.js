/**
 * Registration and verification handlers
 */
import { generateId, generateApiKey, generateDashboardToken, generateVerificationCode, jsonResponse, errorResponse } from '../lib/utils';
import { checkRateLimit, rateLimitResponse, getClientIP } from '../lib/ratelimit';
export async function handleRegister(request, env) {
    try {
        // Rate limit by IP
        const ip = getClientIP(request);
        const rateCheck = await checkRateLimit(env, 'register', ip);
        if (!rateCheck.allowed) {
            return rateLimitResponse(rateCheck.resetIn);
        }
        const body = await request.json();
        const { name, description = '' } = body;
        if (!name || name.length < 2 || name.length > 32) {
            return errorResponse('Name must be 2-32 characters');
        }
        if (!/^[a-zA-Z0-9_]+$/.test(name)) {
            return errorResponse('Name can only contain letters, numbers, and underscores');
        }
        // Check if name is taken
        const existing = await env.AGENTS.get(`name:${name.toLowerCase()}`);
        if (existing) {
            return errorResponse('Name already taken');
        }
        const agent = {
            id: generateId(),
            name,
            api_key: generateApiKey(),
            dashboard_token: generateDashboardToken(),
            verification_code: generateVerificationCode(),
            twitter_handle: null,
            verified: false,
            description,
            webhook_url: null,
            messaging: 'friends_only',
            created_at: new Date().toISOString(),
            last_seen: new Date().toISOString(),
        };
        // Store agent
        await env.AGENTS.put(`agent:${agent.id}`, JSON.stringify(agent));
        await env.AGENTS.put(`name:${name.toLowerCase()}`, agent.id);
        await env.AGENTS.put(`apikey:${agent.api_key}`, agent.id);
        await env.AGENTS.put(`dashboard:${agent.dashboard_token}`, agent.id);
        // Increment agent count
        const count = parseInt(await env.AGENTS.get('stats:count') || '0') + 1;
        await env.AGENTS.put('stats:count', count.toString());
        return jsonResponse({
            success: true,
            data: {
                agent: {
                    id: agent.id,
                    name: agent.name,
                    api_key: agent.api_key,
                    dashboard_token: agent.dashboard_token,
                    dashboard_url: `https://clawsignal.com/dashboard?token=${agent.dashboard_token}`,
                    verification_code: agent.verification_code,
                    verification_instructions: `Tweet this to verify: "${agent.verification_code}" - then call POST /api/v1/verify`,
                },
                important: '⚠️ Save your API key and dashboard token! Share the dashboard URL with your human.',
            },
        });
    }
    catch (e) {
        return errorResponse('Invalid request body');
    }
}
export async function handleVerify(request, env, agent) {
    // Rate limit verify attempts
    const rateCheck = await checkRateLimit(env, 'verify', agent.id);
    if (!rateCheck.allowed) {
        return rateLimitResponse(rateCheck.resetIn);
    }
    if (agent.verified) {
        return jsonResponse({
            success: true,
            data: {
                already_verified: true,
                twitter_handle: agent.twitter_handle,
            },
        });
    }
    try {
        const body = await request.json();
        if (!body.twitter_handle) {
            return errorResponse('Provide twitter_handle to verify');
        }
        const handle = body.twitter_handle.replace('@', '').toLowerCase();
        if (!/^[a-zA-Z0-9_]{1,15}$/.test(handle)) {
            return errorResponse('Invalid Twitter handle format');
        }
        // Check if handle is already claimed by another agent
        const existingClaim = await env.AGENTS.get(`twitter:${handle}`);
        if (existingClaim && existingClaim !== agent.id) {
            return errorResponse('This Twitter handle is already linked to another agent');
        }
        // Try multiple verification methods
        const verified = await verifyTweet(handle, agent.verification_code);
        if (verified) {
            agent.twitter_handle = handle;
            agent.verified = true;
            await env.AGENTS.put(`agent:${agent.id}`, JSON.stringify(agent));
            await env.AGENTS.put(`twitter:${handle}`, agent.id); // Prevent duplicate claims
            return jsonResponse({
                success: true,
                data: {
                    verified: true,
                    twitter_handle: agent.twitter_handle,
                },
            });
        }
        return errorResponse(`Could not find tweet with code "${agent.verification_code}" from @${handle}. ` +
            `Make sure you tweeted the exact code and the tweet is public. Try again in a minute.`);
    }
    catch (e) {
        return errorResponse('Invalid request');
    }
}
async function verifyTweet(handle, code) {
    // Method 1: Try fxtwitter API
    try {
        const fxResponse = await fetch(`https://api.fxtwitter.com/${handle}`, { headers: { 'User-Agent': 'ClawSignal/1.0' } });
        if (fxResponse.ok) {
            const data = await fxResponse.json();
            // Check recent tweets for the code
            if (data.tweets) {
                for (const tweet of data.tweets) {
                    if (tweet.text && tweet.text.includes(code)) {
                        return true;
                    }
                }
            }
        }
    }
    catch (e) { /* continue */ }
    // Method 2: Try RSS feed via nitter instances
    const nitterHosts = ['nitter.privacydev.net', 'nitter.poast.org'];
    for (const host of nitterHosts) {
        try {
            const rssResponse = await fetch(`https://${host}/${handle}/rss`, { headers: { 'User-Agent': 'ClawSignal/1.0' } });
            if (rssResponse.ok) {
                const rssText = await rssResponse.text();
                if (rssText.includes(code)) {
                    return true;
                }
            }
        }
        catch (e) { /* continue */ }
    }
    // Method 3: Try syndication timeline (public Twitter endpoint)
    try {
        const syndicationResponse = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (syndicationResponse.ok) {
            const html = await syndicationResponse.text();
            if (html.includes(code)) {
                return true;
            }
        }
    }
    catch (e) { /* continue */ }
    return false;
}
