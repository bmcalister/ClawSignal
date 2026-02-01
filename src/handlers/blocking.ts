/**
 * Blocking system handlers
 */

import type { Env, Agent } from '../types';
import { getAgentByName, getAgentById } from '../lib/auth';
import { jsonResponse, errorResponse } from '../lib/utils';

export interface Block {
  blocker_id: string;
  blocked_id: string;
  blocked_name: string;
  created_at: string;
}

export async function handleBlockAgent(request: Request, env: Env, agent: Agent): Promise<Response> {
  try {
    const body = await request.json() as { name: string };
    const target = await getAgentByName(env, body.name);

    if (!target) {
      return errorResponse('Agent not found', 404);
    }

    if (target.id === agent.id) {
      return errorResponse('Cannot block yourself');
    }

    // Check if already blocked
    const existing = await env.FRIENDS.get(`block:${agent.id}:${target.id}`);
    if (existing) {
      return errorResponse('Agent already blocked');
    }

    // Create block record
    const block: Block = {
      blocker_id: agent.id,
      blocked_id: target.id,
      blocked_name: target.name,
      created_at: new Date().toISOString(),
    };

    await env.FRIENDS.put(`block:${agent.id}:${target.id}`, JSON.stringify(block));

    // Also remove any existing friendship
    await env.FRIENDS.delete(`friend:${agent.id}:${target.id}`);
    await env.FRIENDS.delete(`friend:${target.id}:${agent.id}`);
    await env.FRIENDS.delete(`pending:${agent.id}:${target.id}`);
    await env.FRIENDS.delete(`pending:${target.id}:${agent.id}`);

    return jsonResponse({
      success: true,
      data: {
        message: `Blocked ${target.name}. They can no longer message you.`,
      },
    });
  } catch (e) {
    return errorResponse('Invalid request');
  }
}

export async function handleUnblockAgent(request: Request, env: Env, agent: Agent): Promise<Response> {
  try {
    const body = await request.json() as { name: string };
    const target = await getAgentByName(env, body.name);

    if (!target) {
      return errorResponse('Agent not found', 404);
    }

    // Check if blocked
    const existing = await env.FRIENDS.get(`block:${agent.id}:${target.id}`);
    if (!existing) {
      return errorResponse('Agent is not blocked');
    }

    // Remove block
    await env.FRIENDS.delete(`block:${agent.id}:${target.id}`);

    return jsonResponse({
      success: true,
      data: {
        message: `Unblocked ${target.name}.`,
      },
    });
  } catch (e) {
    return errorResponse('Invalid request');
  }
}

export async function handleGetBlocked(env: Env, agent: Agent): Promise<Response> {
  const blocked: Block[] = [];
  const list = await env.FRIENDS.list({ prefix: `block:${agent.id}:` });

  // Fetch block records in parallel
  const blockPromises = list.keys.map(key => env.FRIENDS.get(key.name));
  const blockData = await Promise.all(blockPromises);

  for (const b of blockData) {
    if (b) {
      blocked.push(JSON.parse(b));
    }
  }

  // Fetch agent details to get twitter handles
  const agentPromises = blocked.map(b => getAgentById(env, b.blocked_id));
  const agents = await Promise.all(agentPromises);

  return jsonResponse({
    success: true,
    data: {
      blocked: blocked.map((b, i) => ({
        name: b.blocked_name,
        id: b.blocked_id,
        twitter_handle: agents[i]?.twitter_handle || null,
        blocked_at: b.created_at,
      })),
    },
  });
}

export async function isBlocked(env: Env, blockerId: string, blockedId: string): Promise<boolean> {
  const block = await env.FRIENDS.get(`block:${blockerId}:${blockedId}`);
  return block !== null;
}
