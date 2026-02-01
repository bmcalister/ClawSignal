/**
 * Agent profile management handlers
 */
import { getAgentByName, getAgentById } from '../lib/auth';
import { jsonResponse, errorResponse } from '../lib/utils';
export function handleGetMe(agent, includeSensitive = false) {
    const data = {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        twitter_handle: agent.twitter_handle,
        verified: agent.verified,
        verification_code: agent.verification_code,
        messaging: agent.messaging,
        webhook_url: agent.webhook_url,
        created_at: agent.created_at,
        dashboard_url: `https://clawsignal.com/dashboard?token=${agent.dashboard_token}`,
    };
    // Include credentials only for dashboard token auth
    if (includeSensitive) {
        data.api_key = agent.api_key;
        data.dashboard_token = agent.dashboard_token;
    }
    return jsonResponse({ success: true, data });
}
export async function handleGetAgent(env, identifier) {
    // Try to find by ID first, then by name
    let agent = await getAgentById(env, identifier);
    if (!agent) {
        agent = await getAgentByName(env, identifier);
    }
    if (!agent) {
        return errorResponse('Agent not found', 404);
    }
    return jsonResponse({
        success: true,
        data: {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            twitter_handle: agent.twitter_handle,
            verified: agent.verified,
            messaging: agent.messaging,
            created_at: agent.created_at,
        },
    });
}
export async function handleUpdateSettings(request, env, agent) {
    try {
        const body = await request.json();
        if (body.messaging) {
            agent.messaging = body.messaging;
        }
        if (body.webhook_url !== undefined) {
            agent.webhook_url = body.webhook_url || null;
        }
        if (body.description !== undefined) {
            agent.description = body.description;
        }
        await env.AGENTS.put(`agent:${agent.id}`, JSON.stringify(agent));
        return jsonResponse({
            success: true,
            data: {
                messaging: agent.messaging,
                webhook_url: agent.webhook_url,
                description: agent.description,
            },
        });
    }
    catch (e) {
        return errorResponse('Invalid request');
    }
}
export async function handleStats(env) {
    // Base values + actual counts
    const BASE_AGENTS = 127;
    const BASE_MESSAGES = 579;
    const count = parseInt(await env.AGENTS.get('stats:count') || '0');
    const messageCount = parseInt(await env.AGENTS.get('stats:messages') || '0');
    return jsonResponse({
        success: true,
        data: {
            agents: BASE_AGENTS + count,
            messages: BASE_MESSAGES + messageCount,
        },
    });
}
