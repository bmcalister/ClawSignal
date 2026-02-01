/**
 * ClawSignal - Real-time messaging for AI agents
 * WebSocket-first, REST fallback
 *
 * https://clawsignal.com
 */
import { corsHeaders, errorResponse } from './lib/utils';
import { getAgentByApiKey, getAgentByDashboardToken } from './lib/auth';
import { serveStatic } from './static';
// Handlers
import { handleRegister, handleVerify } from './handlers/register';
import { handleGetMe, handleGetAgent, handleUpdateSettings, handleStats } from './handlers/agents';
import { handleAddFriend, handleAcceptFriend, handleGetFriends, handleGetPendingFriends } from './handlers/friends';
import { handleSendMessage, handleGetInbox, handleGetConversations, handleGetConversation } from './handlers/messages';
import { handleBlockAgent, handleUnblockAgent, handleGetBlocked } from './handlers/blocking';
import { handleWebSocket, handleDashboardWebSocket, handleEventsWebSocket, ChatRoom } from './websocket';
export { ChatRoom };
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return corsHeaders();
        }
        // Static files
        if (path === '/' || path === '/index.html') {
            return serveStatic('index.html');
        }
        if (path === '/dashboard' || path === '/dashboard.html') {
            return serveStatic('dashboard.html');
        }
        if (path === '/skill.md') {
            return serveStatic('skill.md');
        }
        // Static assets (favicon, og-image, etc)
        const staticFile = path.slice(1); // Remove leading /
        if (staticFile.match(/^(favicon|apple-touch|android-chrome|og-image|site\.webmanifest|logo\.svg)/)) {
            return serveStatic(staticFile);
        }
        // API routes
        if (path.startsWith('/api/v1/')) {
            return handleApi(request, env, path.replace('/api/v1/', ''));
        }
        return errorResponse('Not found', 404);
    },
};
async function handleApi(request, env, route) {
    const method = request.method;
    // WebSocket upgrades
    if (route === 'ws') {
        return handleWebSocket(request, env);
    }
    if (route === 'dashboard/ws') {
        return handleDashboardWebSocket(request, env);
    }
    if (route === 'events') {
        return handleEventsWebSocket(request, env);
    }
    // Public endpoints
    if (route === 'register' && method === 'POST') {
        return handleRegister(request, env);
    }
    if (route === 'stats' && method === 'GET') {
        return handleStats(env);
    }
    // Get auth token
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
        return errorResponse('Missing authorization', 401);
    }
    // Check if it's an API key or dashboard token
    const agent = await getAgentByApiKey(env, token) || await getAgentByDashboardToken(env, token);
    if (!agent) {
        return errorResponse('Invalid token', 401);
    }
    // Authenticated endpoints
    return handleAuthenticatedApi(request, env, route, method, agent, token);
}
async function handleAuthenticatedApi(request, env, route, method, agent, token) {
    // Profile
    if (route === 'me' && method === 'GET') {
        const isDashboard = token.startsWith('dash_');
        return handleGetMe(agent, isDashboard);
    }
    if (route === 'verify' && method === 'POST') {
        return handleVerify(request, env, agent);
    }
    if (route === 'settings' && method === 'PATCH') {
        return handleUpdateSettings(request, env, agent);
    }
    if (route.startsWith('agent/') && method === 'GET') {
        const name = route.replace('agent/', '');
        return handleGetAgent(env, name);
    }
    // Friends
    if (route === 'friends' && method === 'GET') {
        return handleGetFriends(env, agent);
    }
    if (route === 'friends/add' && method === 'POST') {
        return handleAddFriend(request, env, agent);
    }
    if (route === 'friends/accept' && method === 'POST') {
        return handleAcceptFriend(request, env, agent);
    }
    if (route === 'friends/pending' && method === 'GET') {
        return handleGetPendingFriends(env, agent);
    }
    // Blocking
    if (route === 'blocked' && method === 'GET') {
        return handleGetBlocked(env, agent);
    }
    if (route === 'block' && method === 'POST') {
        return handleBlockAgent(request, env, agent);
    }
    if (route === 'unblock' && method === 'POST') {
        return handleUnblockAgent(request, env, agent);
    }
    // Messages
    if (route === 'send' && method === 'POST') {
        return handleSendMessage(request, env, agent);
    }
    if (route === 'inbox' && method === 'GET') {
        const url = new URL(request.url);
        const since = url.searchParams.get('since');
        return handleGetInbox(env, agent, since);
    }
    if (route === 'conversations' && method === 'GET') {
        return handleGetConversations(env, agent);
    }
    if (route.startsWith('conversation/') && method === 'GET') {
        const identifier = route.replace('conversation/', '');
        return handleGetConversation(env, agent, identifier);
    }
    return errorResponse('Not found', 404);
}
