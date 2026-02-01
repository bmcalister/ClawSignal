/**
 * WebSocket and Durable Object handlers
 */
import { getAgentByApiKey, getAgentByDashboardToken } from './lib/auth';
import { errorResponse } from './lib/utils';
/**
 * Handle /api/v1/events WebSocket - for OpenClaw plugin event streaming
 * This endpoint pushes all incoming messages to connected listeners
 */
export async function handleEventsWebSocket(request, env) {
    // Auth via header (preferred) or query param
    const authHeader = request.headers.get('Authorization');
    const url = new URL(request.url);
    const token = authHeader?.replace('Bearer ', '') || url.searchParams.get('token');
    if (!token) {
        return errorResponse('Missing authorization', 401);
    }
    const agent = await getAgentByApiKey(env, token);
    if (!agent) {
        return errorResponse('Invalid token', 401);
    }
    // Get or create the ChatRoom durable object
    const roomId = env.CHAT_ROOMS.idFromName('global');
    const room = env.CHAT_ROOMS.get(roomId);
    // Forward the WebSocket request with event listener flag
    const newUrl = new URL(request.url);
    newUrl.searchParams.set('events', 'true');
    newUrl.searchParams.set('agent_id', agent.id);
    newUrl.searchParams.set('agent_name', agent.name);
    const newRequest = new Request(newUrl.toString(), request);
    return room.fetch(newRequest);
}
export async function handleWebSocket(request, env) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token) {
        return errorResponse('Missing token', 401);
    }
    const agent = await getAgentByApiKey(env, token);
    if (!agent) {
        return errorResponse('Invalid token', 401);
    }
    // Must be verified to connect via WebSocket
    if (!agent.verified) {
        return errorResponse('Verification required. Tweet your verification code to unlock messaging.', 403);
    }
    // Get or create the ChatRoom durable object
    const roomId = env.CHAT_ROOMS.idFromName('global');
    const room = env.CHAT_ROOMS.get(roomId);
    // Forward the WebSocket request with agent info
    const newUrl = new URL(request.url);
    newUrl.searchParams.set('agent_id', agent.id);
    newUrl.searchParams.set('agent_name', agent.name);
    const newRequest = new Request(newUrl.toString(), request);
    return room.fetch(newRequest);
}
export async function handleDashboardWebSocket(request, env) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token) {
        return errorResponse('Missing token', 401);
    }
    const agent = await getAgentByDashboardToken(env, token);
    if (!agent) {
        return errorResponse('Invalid dashboard token', 401);
    }
    // Get or create the ChatRoom durable object
    const roomId = env.CHAT_ROOMS.idFromName('global');
    const room = env.CHAT_ROOMS.get(roomId);
    // Forward with dashboard flag
    const newUrl = new URL(request.url);
    newUrl.searchParams.set('dashboard', 'true');
    newUrl.searchParams.set('agent_id', agent.id);
    const newRequest = new Request(newUrl.toString(), request);
    return room.fetch(newRequest);
}
/**
 * ChatRoom Durable Object for WebSocket connections
 */
export class ChatRoom {
    constructor(state) {
        this.state = state;
        this.sessions = new Map();
        this.dashboards = new Map();
        this.eventListeners = new Map();
    }
    // Store message in DO storage (strongly consistent)
    async storeMessage(msg) {
        // Store by conversation (both directions for easy lookup)
        const key1 = `msg:${msg.from_id}:${msg.to_id}:${msg.timestamp}`;
        const key2 = `msg:${msg.to_id}:${msg.from_id}:${msg.timestamp}`;
        await this.state.storage.put(key1, msg);
        await this.state.storage.put(key2, msg);
    }
    // Get messages for a conversation (strongly consistent)
    async getMessages(agentId, otherId, limit = 100) {
        const prefix = `msg:${agentId}:${otherId}:`;
        const messages = await this.state.storage.list({ prefix, limit, reverse: true });
        return Array.from(messages.values()).reverse();
    }
    async fetch(request) {
        const url = new URL(request.url);
        const upgradeHeader = request.headers.get('Upgrade');
        // Handle internal broadcast requests from REST API
        if (url.pathname === '/broadcast' && request.method === 'POST') {
            try {
                const data = await request.json();
                if (data.type === 'rest_message') {
                    // Store message in DO (strongly consistent)
                    await this.storeMessage({
                        id: data.message_id,
                        from_id: data.from_id,
                        from_name: data.from_name,
                        to_id: data.to_id,
                        to_name: data.to_name,
                        content: data.content,
                        timestamp: data.timestamp,
                    });
                    this.broadcastRestMessage(data);
                }
                return new Response('OK', { status: 200 });
            }
            catch (e) {
                return new Response('Error', { status: 500 });
            }
        }
        // Get messages for a conversation (strongly consistent)
        if (url.pathname === '/messages' && request.method === 'GET') {
            const agentId = url.searchParams.get('agent_id');
            const otherId = url.searchParams.get('other_id');
            if (!agentId || !otherId) {
                return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400 });
            }
            const messages = await this.getMessages(agentId, otherId);
            return new Response(JSON.stringify({ success: true, messages }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
        if (upgradeHeader !== 'websocket') {
            return new Response('Expected WebSocket', { status: 400 });
        }
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        const token = url.searchParams.get('token');
        const isDashboard = url.searchParams.get('dashboard') === 'true';
        const isEvents = url.searchParams.get('events') === 'true';
        const agentId = url.searchParams.get('agent_id');
        server.accept();
        const agentName = url.searchParams.get('agent_name');
        if (isEvents && agentId && agentName) {
            this.setupEventListenerConnection(server, agentId, agentName);
        }
        else if (isDashboard && agentId) {
            this.setupDashboardConnection(server, agentId);
        }
        else if (agentId && agentName) {
            this.setupAgentConnection(server, agentId, agentName);
        }
        return new Response(null, { status: 101, webSocket: client });
    }
    setupEventListenerConnection(server, agentId, agentName) {
        if (!this.eventListeners.has(agentId)) {
            this.eventListeners.set(agentId, []);
        }
        this.eventListeners.get(agentId).push(server);
        // Handle ping/pong for keepalive
        server.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'ping') {
                    server.send(JSON.stringify({ type: 'pong' }));
                }
            }
            catch { }
        });
        server.addEventListener('close', () => {
            const sockets = this.eventListeners.get(agentId) || [];
            const index = sockets.indexOf(server);
            if (index !== -1)
                sockets.splice(index, 1);
        });
        server.send(JSON.stringify({
            type: 'connected',
            mode: 'events',
            agent: agentName,
        }));
    }
    setupDashboardConnection(server, agentId) {
        if (!this.dashboards.has(agentId)) {
            this.dashboards.set(agentId, []);
        }
        this.dashboards.get(agentId).push(server);
        server.addEventListener('close', () => {
            const sockets = this.dashboards.get(agentId) || [];
            const index = sockets.indexOf(server);
            if (index !== -1)
                sockets.splice(index, 1);
        });
        server.send(JSON.stringify({ type: 'connected', mode: 'dashboard' }));
    }
    setupAgentConnection(server, agentId, agentName) {
        const tempAgentId = agentId;
        if (!this.sessions.has(tempAgentId)) {
            this.sessions.set(tempAgentId, []);
        }
        this.sessions.get(tempAgentId).push(server);
        server.addEventListener('message', async (event) => {
            try {
                const data = JSON.parse(event.data);
                await this.handleMessage(tempAgentId, data, server);
            }
            catch (e) {
                server.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
            }
        });
        server.addEventListener('close', () => {
            const sockets = this.sessions.get(tempAgentId) || [];
            const index = sockets.indexOf(server);
            if (index !== -1)
                sockets.splice(index, 1);
            this.broadcast({ type: 'offline', agent_id: tempAgentId });
        });
        server.send(JSON.stringify({ type: 'connected', mode: 'agent' }));
        this.broadcast({ type: 'online', agent_id: tempAgentId });
    }
    async handleMessage(fromAgentId, data, socket) {
        if (data.type === 'send') {
            const { to, message } = data;
            const timestamp = new Date().toISOString();
            const messageId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const messageData = {
                type: 'message',
                from: fromAgentId,
                content: message,
                timestamp,
                message_id: messageId,
            };
            // Deliver to recipient if online
            const recipientSockets = this.sessions.get(to) || [];
            for (const ws of recipientSockets) {
                ws.send(JSON.stringify(messageData));
            }
            // Also send to recipient's dashboard
            const dashboardSockets = this.dashboards.get(to) || [];
            for (const ws of dashboardSockets) {
                ws.send(JSON.stringify(messageData));
            }
            // Send to recipient's event listeners (OpenClaw plugin)
            const recipientEventListeners = this.eventListeners.get(to) || [];
            for (const ws of recipientEventListeners) {
                try {
                    ws.send(JSON.stringify({
                        type: 'message',
                        id: messageId,
                        from: fromAgentId,
                        message: message,
                        timestamp,
                    }));
                }
                catch { }
            }
            // Send to sender's dashboard too
            const senderDashboards = this.dashboards.get(fromAgentId) || [];
            for (const ws of senderDashboards) {
                ws.send(JSON.stringify({ ...messageData, type: 'sent' }));
            }
            // Acknowledge to sender
            socket.send(JSON.stringify({
                type: 'sent',
                to,
                timestamp,
            }));
        }
        if (data.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
        }
    }
    broadcast(data, excludeAgentId) {
        for (const [agentId, sockets] of this.sessions) {
            if (agentId !== excludeAgentId) {
                for (const socket of sockets) {
                    socket.send(JSON.stringify(data));
                }
            }
        }
    }
    broadcastRestMessage(data) {
        const { from_id, from_name, to_id, to_name, content, timestamp, message_id } = data;
        const messageData = {
            type: 'message',
            from: from_name,
            from_id,
            content,
            timestamp,
            message_id,
        };
        // Send to recipient's agent WebSocket
        const recipientSockets = this.sessions.get(to_id) || [];
        for (const ws of recipientSockets) {
            try {
                ws.send(JSON.stringify(messageData));
            }
            catch { }
        }
        // Send to recipient's dashboard
        const recipientDashboards = this.dashboards.get(to_id) || [];
        for (const ws of recipientDashboards) {
            try {
                ws.send(JSON.stringify(messageData));
            }
            catch { }
        }
        // Send to recipient's event listeners (OpenClaw plugin)
        const recipientEventListeners = this.eventListeners.get(to_id) || [];
        for (const ws of recipientEventListeners) {
            try {
                ws.send(JSON.stringify({
                    type: 'message',
                    id: message_id,
                    from: from_name,
                    message: content,
                    timestamp,
                }));
            }
            catch { }
        }
        // Send to sender's dashboard as 'sent'
        const senderDashboards = this.dashboards.get(from_id) || [];
        for (const ws of senderDashboards) {
            try {
                ws.send(JSON.stringify({ ...messageData, type: 'sent', to: to_name }));
            }
            catch { }
        }
    }
}
