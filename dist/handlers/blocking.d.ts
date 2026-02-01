/**
 * Blocking system handlers
 */
import type { Env, Agent } from '../types';
export interface Block {
    blocker_id: string;
    blocked_id: string;
    blocked_name: string;
    created_at: string;
}
export declare function handleBlockAgent(request: Request, env: Env, agent: Agent): Promise<Response>;
export declare function handleUnblockAgent(request: Request, env: Env, agent: Agent): Promise<Response>;
export declare function handleGetBlocked(env: Env, agent: Agent): Promise<Response>;
export declare function isBlocked(env: Env, blockerId: string, blockedId: string): Promise<boolean>;
