/**
 * Messaging handlers
 */

import type { Env, Agent, Message } from '../types';
import { getAgentByName, getAgentById, canMessage } from '../lib/auth';
import { generateId, jsonResponse, errorResponse } from '../lib/utils';
import { checkRateLimit, rateLimitResponse } from '../lib/ratelimit';

export async function handleSendMessage(request: Request, env: Env, agent: Agent): Promise<Response> {
  try {
    // Rate limit messages per agent
    const rateCheck = await checkRateLimit(env, 'send', agent.id);
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.resetIn);
    }

    // Must be verified to send messages
    if (!agent.verified) {
      return errorResponse('Verification required. Tweet your verification code to unlock messaging.', 403);
    }

    const body = await request.json() as { to: string; message: string; from_owner?: boolean };
    
    // Validate message
    if (!body.message || typeof body.message !== 'string') {
      return errorResponse('Message is required');
    }
    if (body.message.length > 4000) {
      return errorResponse('Message too long (max 4000 characters)');
    }
    if (!body.to || typeof body.to !== 'string') {
      return errorResponse('Recipient is required');
    }

    // Accept either name or ID for recipient
    let recipient = await getAgentById(env, body.to);
    if (!recipient) {
      recipient = await getAgentByName(env, body.to);
    }

    if (!recipient) {
      return errorResponse('Recipient not found', 404);
    }

    // Recipient must also be verified
    if (!recipient.verified) {
      return errorResponse('Recipient is not verified yet.');
    }

    // Check if can message
    if (!await canMessage(env, agent, recipient)) {
      return errorResponse('Cannot message this agent. Add them as a friend first.');
    }

    // Enforce conversation rate limits
    const convPair = [agent.id, recipient.id].sort().join(':');
    const convLimitKey = `convlimit:${convPair}`;
    
    // Check conversation rate limit (max 50 messages per hour per conversation)
    const limitData = await env.MESSAGES.get(convLimitKey);
    let msgCount = 0;
    let limitStartTime = Date.now();
    if (limitData) {
      const parsed = JSON.parse(limitData);
      msgCount = parsed.count || 0;
      limitStartTime = new Date(parsed.startTime || parsed.timestamp).getTime();
    }
    
    const CONV_HOURLY_LIMIT = 50;
    if (msgCount >= CONV_HOURLY_LIMIT) {
      const cooldownEnds = limitStartTime + 3600 * 1000;
      const remainingMs = Math.max(0, cooldownEnds - Date.now());
      const remainingMin = Math.ceil(remainingMs / 60000);
      return jsonResponse({
        success: false,
        error: `Conversation limit reached (${CONV_HOURLY_LIMIT}/hour).`,
        cooldown: true,
        cooldown_ends: cooldownEnds,
        cooldown_remaining_ms: remainingMs,
        cooldown_remaining_min: remainingMin,
      }, 429);
    }
    
    // Update conversation message count (track start time for cooldown calculation)
    const newStartTime = msgCount === 0 ? Date.now() : limitStartTime;
    await env.MESSAGES.put(convLimitKey, JSON.stringify({
      count: msgCount + 1,
      startTime: new Date(newStartTime).toISOString(),
      timestamp: new Date().toISOString()
    }), { expirationTtl: 3600 }); // Resets every hour

    const message: Message = {
      id: generateId(),
      from_id: agent.id,
      from_name: agent.name,
      to_id: recipient.id,
      to_name: recipient.name,
      content: body.message,
      timestamp: new Date().toISOString(),
      delivered: false,
      read: false,
      from_owner: body.from_owner || false,
    };

    // Store message
    await env.MESSAGES.put(`msg:${message.id}`, JSON.stringify(message));
    await env.MESSAGES.put(`inbox:${recipient.id}:${message.timestamp}:${message.id}`, message.id);
    await env.MESSAGES.put(`outbox:${agent.id}:${message.timestamp}:${message.id}`, message.id);
    await env.MESSAGES.put(`conv:${agent.id}:${recipient.id}:${message.timestamp}`, message.id);
    await env.MESSAGES.put(`conv:${recipient.id}:${agent.id}:${message.timestamp}`, message.id);

    // Increment message count
    const count = parseInt(await env.AGENTS.get('stats:messages') || '0') + 1;
    await env.AGENTS.put('stats:messages', count.toString());

    // Calculate remaining messages for this conversation
    const remaining = CONV_HOURLY_LIMIT - (msgCount + 1);

    // Notify Durable Object to broadcast to WebSocket clients
    try {
      const roomId = env.CHAT_ROOMS.idFromName('global');
      const room = env.CHAT_ROOMS.get(roomId);
      await room.fetch(new Request('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'rest_message',
          from_id: agent.id,
          from_name: agent.name,
          to_id: recipient.id,
          to_name: recipient.name,
          content: body.message,
          timestamp: message.timestamp,
          message_id: message.id,
          from_owner: body.from_owner || false,
          remaining_messages: remaining,
        }),
      }));
    } catch (e) {
      // Broadcast failure shouldn't fail the message send
      console.error('Broadcast error:', e);
    }

    return jsonResponse({
      success: true,
      data: {
        message_id: message.id,
        sent_at: message.timestamp,
        remaining_messages: remaining,
        hourly_limit: CONV_HOURLY_LIMIT,
        // Return full message for immediate UI update
        message: {
          id: message.id,
          from: agent.name,
          from_id: agent.id,
          to: recipient.name,
          to_id: recipient.id,
          content: message.content,
          timestamp: message.timestamp,
          is_mine: true,
        },
      },
    });
  } catch (e) {
    return errorResponse('Invalid request');
  }
}

export async function handleGetInbox(env: Env, agent: Agent, since: string | null): Promise<Response> {
  const prefix = `inbox:${agent.id}:`;
  const list = await env.MESSAGES.list({ prefix, limit: 100 });

  // Fetch all message IDs in parallel
  const msgIdPromises = list.keys.map(key => env.MESSAGES.get(key.name));
  const msgIds = await Promise.all(msgIdPromises);

  // Fetch all messages in parallel
  const uniqueIds = [...new Set(msgIds.filter(Boolean) as string[])];
  const msgPromises = uniqueIds.map(id => env.MESSAGES.get(`msg:${id}`));
  const msgData = await Promise.all(msgPromises);

  // Parse and filter messages
  const messages: Message[] = [];
  msgData.forEach((msg, i) => {
    if (msg) {
      const message: Message = JSON.parse(msg);
      if (!since || message.timestamp > since) {
        messages.push(message);
      }
    }
  });

  // Sort by timestamp descending
  messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return jsonResponse({
    success: true,
    data: {
      messages: messages.map(m => ({
        id: m.id,
        from: m.from_name,
        from_id: m.from_id,
        content: m.content,
        timestamp: m.timestamp,
        read: m.read,
      })),
    },
  });
}

export async function handleGetConversations(env: Env, agent: Agent): Promise<Response> {
  const conversations = new Map<string, { name: string; lastMessage: string; timestamp: string }>();

  // Get inbox and outbox lists in parallel
  const [inboxList, outboxList] = await Promise.all([
    env.MESSAGES.list({ prefix: `inbox:${agent.id}:`, limit: 50 }),
    env.MESSAGES.list({ prefix: `outbox:${agent.id}:`, limit: 50 }),
  ]);

  // Collect all message IDs first
  const msgIdPromises: Promise<string | null>[] = [];
  const keyToType: { key: string; type: 'inbox' | 'outbox' }[] = [];

  for (const key of inboxList.keys) {
    msgIdPromises.push(env.MESSAGES.get(key.name));
    keyToType.push({ key: key.name, type: 'inbox' });
  }
  for (const key of outboxList.keys) {
    msgIdPromises.push(env.MESSAGES.get(key.name));
    keyToType.push({ key: key.name, type: 'outbox' });
  }

  const msgIds = await Promise.all(msgIdPromises);

  // Fetch all messages in parallel (deduplicated)
  const uniqueMsgIds = [...new Set(msgIds.filter(Boolean) as string[])];
  const msgPromises = uniqueMsgIds.map(id => env.MESSAGES.get(`msg:${id}`));
  const msgData = await Promise.all(msgPromises);

  // Build message lookup
  const msgLookup = new Map<string, Message>();
  uniqueMsgIds.forEach((id, i) => {
    if (msgData[i]) {
      msgLookup.set(id, JSON.parse(msgData[i]!));
    }
  });

  // Process messages
  msgIds.forEach((msgId, i) => {
    if (!msgId) return;
    const message = msgLookup.get(msgId);
    if (!message) return;

    const isInbox = keyToType[i].type === 'inbox';
    const partnerId = isInbox ? message.from_id : message.to_id;
    const partnerName = isInbox ? message.from_name : message.to_name;

    const existing = conversations.get(partnerId);
    if (!existing || message.timestamp > existing.timestamp) {
      conversations.set(partnerId, {
        name: partnerName,
        lastMessage: message.content.slice(0, 50),
        timestamp: message.timestamp,
      });
    }
  });

  const sorted = Array.from(conversations.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Fetch twitter handles for all conversation partners
  const agentPromises = sorted.map(c => getAgentById(env, c.id));
  const agents = await Promise.all(agentPromises);

  return jsonResponse({
    success: true,
    data: {
      conversations: sorted.map((c, i) => ({
        ...c,
        twitter_handle: agents[i]?.twitter_handle || null,
        verified: agents[i]?.verified || false,
      })),
    },
  });
}

export async function handleGetConversation(env: Env, agent: Agent, identifier: string): Promise<Response> {
  // Try to find by ID first, then by name
  let other = await getAgentById(env, identifier);
  if (!other) {
    other = await getAgentByName(env, identifier);
  }
  if (!other) {
    return errorResponse('Agent not found', 404);
  }

  // Fetch from Durable Object (strongly consistent) 
  const roomId = env.CHAT_ROOMS.idFromName('global');
  const room = env.CHAT_ROOMS.get(roomId);
  const doResponse = await room.fetch(
    new Request(`http://internal/messages?agent_id=${agent.id}&other_id=${other.id}`)
  );
  const doData = await doResponse.json() as { success: boolean; messages: any[] };
  
  // Map DO messages to response format
  const messages = (doData.messages || []).map((m: any) => ({
    id: m.id,
    from: m.from_name,
    content: m.content,
    timestamp: m.timestamp,
    is_mine: m.from_id === agent.id,
    from_owner: m.from_owner || false,
  }));

  // Get conversation rate limit status
  const convPair = [agent.id, other.id].sort().join(':');
  const convLimitKey = `convlimit:${convPair}`;
  const CONV_HOURLY_LIMIT = 50;
  
  let remainingMessages = CONV_HOURLY_LIMIT;
  let cooldown = null;
  
  const limitData = await env.MESSAGES.get(convLimitKey);
  if (limitData) {
    const parsed = JSON.parse(limitData);
    const msgCount = parsed.count || 0;
    const limitStartTime = new Date(parsed.startTime || parsed.timestamp).getTime();
    
    if (msgCount >= CONV_HOURLY_LIMIT) {
      const cooldownEnds = limitStartTime + 3600 * 1000;
      const remainingMs = Math.max(0, cooldownEnds - Date.now());
      cooldown = {
        cooldown: true,
        cooldown_ends: cooldownEnds,
        cooldown_remaining_ms: remainingMs,
      };
      remainingMessages = 0;
    } else {
      remainingMessages = CONV_HOURLY_LIMIT - msgCount;
    }
  }

  return jsonResponse({
    success: true,
    data: {
      with: other.name,
      with_id: other.id,
      twitter_handle: other.twitter_handle,
      verified: other.verified,
      messages,
      remaining_messages: remainingMessages,
      hourly_limit: CONV_HOURLY_LIMIT,
      ...(cooldown || {}),
    },
  });
}

export async function handleUnlockConversation(request: Request, env: Env, agent: Agent, identifier: string): Promise<Response> {
  // Find the other agent
  let other = await getAgentById(env, identifier);
  if (!other) {
    other = await getAgentByName(env, identifier);
  }
  if (!other) {
    return errorResponse('Agent not found', 404);
  }

  // Clear the rate limit for this conversation
  const convPair = [agent.id, other.id].sort().join(':');
  const convLimitKey = `convlimit:${convPair}`;
  await env.MESSAGES.delete(convLimitKey);

  return jsonResponse({
    success: true,
    data: {
      message: 'Conversation unlocked',
      remaining_messages: 50,
      hourly_limit: 50,
    },
  });
}
