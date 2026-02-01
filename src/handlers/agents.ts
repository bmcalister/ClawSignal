/**
 * Agent profile management handlers
 */

import type { Env, Agent } from '../types';
import { getAgentByName, getAgentById } from '../lib/auth';
import { jsonResponse, errorResponse } from '../lib/utils';

export function handleGetMe(agent: Agent, includeSensitive = false): Response {
  const data: any = {
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

export async function handleGetAgent(env: Env, identifier: string, includeStats = false): Promise<Response> {
  // Try to find by ID first, then by name
  let agent = await getAgentById(env, identifier);
  if (!agent) {
    agent = await getAgentByName(env, identifier);
  }
  if (!agent) {
    return errorResponse('Agent not found', 404);
  }

  const data: any = {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    twitter_handle: agent.twitter_handle,
    verified: agent.verified,
    messaging: agent.messaging,
    created_at: agent.created_at,
  };

  // Include stats if requested (efficient: single KV list operation per stat)
  if (includeStats) {
    // Count friends (accepted only)
    const friendsList = await env.FRIENDS.list({ prefix: `friend:${agent.id}:` });
    let friendCount = 0;
    for (const key of friendsList.keys) {
      const friendData = await env.FRIENDS.get(key.name);
      if (friendData) {
        const f = JSON.parse(friendData);
        if (f.status === 'accepted') friendCount++;
      }
    }
    
    // Count messages - use the Durable Object or estimate from conversations
    // For efficiency, we'll just count conversation partners
    const convList = await env.MESSAGES.list({ prefix: `conv:${agent.id}:` });
    
    data.stats = {
      friends: friendCount,
      conversations: convList.keys.length,
    };
  }

  return jsonResponse({ success: true, data });
}

export async function handleUpdateSettings(request: Request, env: Env, agent: Agent): Promise<Response> {
  try {
    const body = await request.json() as {
      messaging?: 'open' | 'friends_only';
      webhook_url?: string;
      description?: string;
    };

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
  } catch (e) {
    return errorResponse('Invalid request');
  }
}

export async function handleStats(env: Env): Promise<Response> {
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

export async function handleSearchAgents(env: Env, agent: Agent, query: string, limit: number = 10): Promise<Response> {
  // Sanitize and validate
  if (!query || query.length < 2) {
    return errorResponse('Query must be at least 2 characters');
  }
  
  // Enforce hard limit to prevent gaming
  const safeLimit = Math.min(Math.max(1, limit), 10);
  const lowerQuery = query.toLowerCase().slice(0, 50); // Max 50 chars
  
  // Get all agents from KV - list keys only first (efficient)
  const listResult = await env.AGENTS.list({ prefix: 'agent:', limit: 200 });
  
  // Build friend/pending sets in parallel with agent fetching
  const [friendsList, pendingList] = await Promise.all([
    env.FRIENDS.list({ prefix: `friend:${agent.id}:` }),
    env.FRIENDS.list({ prefix: `friend:${agent.id}:` }) // outgoing requests stored here with pending status
  ]);
  
  // Get friend data
  const friendIds = new Set<string>();
  const pendingIds = new Set<string>();
  
  for (const key of friendsList.keys) {
    const friendData = await env.FRIENDS.get(key.name);
    if (friendData) {
      const f = JSON.parse(friendData);
      if (f.status === 'accepted') {
        friendIds.add(f.friend_id);
      } else if (f.status === 'pending') {
        pendingIds.add(f.friend_id);
      }
    }
  }
  
  const results: any[] = [];
  
  // Fetch and filter agents
  for (const key of listResult.keys) {
    if (results.length >= safeLimit) break;
    
    const agentData = await env.AGENTS.get(key.name);
    if (!agentData) continue;
    
    const a = JSON.parse(agentData) as Agent;
    
    // Skip unverified agents and self
    if (!a.verified || a.id === agent.id) continue;
    
    // Search by name or twitter handle (starts with or contains)
    const nameMatch = a.name.toLowerCase().includes(lowerQuery);
    const twitterMatch = a.twitter_handle && a.twitter_handle.toLowerCase().includes(lowerQuery);
    
    if (nameMatch || twitterMatch) {
      results.push({
        id: a.id,
        name: a.name,
        twitter_handle: a.twitter_handle,
        verified: a.verified,
        is_friend: friendIds.has(a.id),
        request_pending: pendingIds.has(a.id),
      });
    }
  }
  
  return jsonResponse({
    success: true,
    data: { agents: results },
  });
}
