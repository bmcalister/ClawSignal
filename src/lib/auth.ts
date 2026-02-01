/**
 * Authentication helpers for ClawSignal
 */

import type { Env, Agent, Friend } from '../types';

export async function getAgentByApiKey(env: Env, apiKey: string): Promise<Agent | null> {
  const agentId = await env.AGENTS.get(`apikey:${apiKey}`);
  if (!agentId) return null;
  const agent = await env.AGENTS.get(`agent:${agentId}`);
  return agent ? JSON.parse(agent) : null;
}

export async function getAgentByName(env: Env, name: string): Promise<Agent | null> {
  const agentId = await env.AGENTS.get(`name:${name.toLowerCase()}`);
  if (!agentId) return null;
  const agent = await env.AGENTS.get(`agent:${agentId}`);
  return agent ? JSON.parse(agent) : null;
}

export async function getAgentById(env: Env, id: string): Promise<Agent | null> {
  const agent = await env.AGENTS.get(`agent:${id}`);
  return agent ? JSON.parse(agent) : null;
}

export async function getAgentByDashboardToken(env: Env, token: string): Promise<Agent | null> {
  const agentId = await env.AGENTS.get(`dashboard:${token}`);
  if (!agentId) return null;
  const agent = await env.AGENTS.get(`agent:${agentId}`);
  return agent ? JSON.parse(agent) : null;
}

export async function areFriends(env: Env, agentId: string, otherId: string): Promise<boolean> {
  // Check both directions (in case friendship was only stored one way)
  const [f1, f2] = await Promise.all([
    env.FRIENDS.get(`friend:${agentId}:${otherId}`),
    env.FRIENDS.get(`friend:${otherId}:${agentId}`),
  ]);
  
  if (f1) {
    const friend: Friend = JSON.parse(f1);
    if (friend.status === 'accepted') return true;
  }
  if (f2) {
    const friend: Friend = JSON.parse(f2);
    if (friend.status === 'accepted') return true;
  }
  return false;
}

export async function isBlocked(env: Env, blockerId: string, blockedId: string): Promise<boolean> {
  const block = await env.FRIENDS.get(`block:${blockerId}:${blockedId}`);
  return block !== null;
}

export async function canMessage(env: Env, sender: Agent, recipient: Agent): Promise<boolean> {
  // Check if sender is blocked by recipient
  if (await isBlocked(env, recipient.id, sender.id)) {
    return false;
  }
  // Check if recipient is blocked by sender (prevent replies to blocked agents)
  if (await isBlocked(env, sender.id, recipient.id)) {
    return false;
  }
  if (recipient.messaging === 'open') return true;
  return await areFriends(env, sender.id, recipient.id);
}

export async function authenticateRequest(request: Request, env: Env): Promise<Agent | null> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token) return null;
  
  // Check if it's an API key or dashboard token
  return await getAgentByApiKey(env, token) || await getAgentByDashboardToken(env, token);
}
