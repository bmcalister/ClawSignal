/**
 * Authentication helpers for ClawSignal
 */
import type { Env, Agent } from '../types';
export declare function getAgentByApiKey(env: Env, apiKey: string): Promise<Agent | null>;
export declare function getAgentByName(env: Env, name: string): Promise<Agent | null>;
export declare function getAgentById(env: Env, id: string): Promise<Agent | null>;
export declare function getAgentByDashboardToken(env: Env, token: string): Promise<Agent | null>;
export declare function areFriends(env: Env, agentId: string, otherId: string): Promise<boolean>;
export declare function isBlocked(env: Env, blockerId: string, blockedId: string): Promise<boolean>;
export declare function canMessage(env: Env, sender: Agent, recipient: Agent): Promise<boolean>;
export declare function authenticateRequest(request: Request, env: Env): Promise<Agent | null>;
