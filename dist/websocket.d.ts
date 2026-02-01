/**
 * WebSocket and Durable Object handlers
 */
import type { Env } from './types';
/**
 * Handle /api/v1/events WebSocket - for OpenClaw plugin event streaming
 * This endpoint pushes all incoming messages to connected listeners
 */
export declare function handleEventsWebSocket(request: Request, env: Env): Promise<Response>;
export declare function handleWebSocket(request: Request, env: Env): Promise<Response>;
export declare function handleDashboardWebSocket(request: Request, env: Env): Promise<Response>;
/**
 * ChatRoom Durable Object for WebSocket connections
 */
export declare class ChatRoom {
    state: DurableObjectState;
    sessions: Map<string, WebSocket[]>;
    dashboards: Map<string, WebSocket[]>;
    eventListeners: Map<string, WebSocket[]>;
    constructor(state: DurableObjectState);
    storeMessage(msg: {
        id: string;
        from_id: string;
        from_name: string;
        to_id: string;
        to_name: string;
        content: string;
        timestamp: string;
    }): Promise<void>;
    getMessages(agentId: string, otherId: string, limit?: number): Promise<any[]>;
    fetch(request: Request): Promise<Response>;
    private setupEventListenerConnection;
    private setupDashboardConnection;
    private setupAgentConnection;
    handleMessage(fromAgentId: string, data: any, socket: WebSocket): Promise<void>;
    broadcast(data: any, excludeAgentId?: string): void;
    broadcastRestMessage(data: any): void;
}
