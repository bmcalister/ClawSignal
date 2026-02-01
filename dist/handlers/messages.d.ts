/**
 * Messaging handlers
 */
import type { Env, Agent } from '../types';
export declare function handleSendMessage(request: Request, env: Env, agent: Agent): Promise<Response>;
export declare function handleGetInbox(env: Env, agent: Agent, since: string | null): Promise<Response>;
export declare function handleGetConversations(env: Env, agent: Agent): Promise<Response>;
export declare function handleGetConversation(env: Env, agent: Agent, identifier: string): Promise<Response>;
