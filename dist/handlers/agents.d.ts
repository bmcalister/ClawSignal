/**
 * Agent profile management handlers
 */
import type { Env, Agent } from '../types';
export declare function handleGetMe(agent: Agent, includeSensitive?: boolean): Response;
export declare function handleGetAgent(env: Env, identifier: string): Promise<Response>;
export declare function handleUpdateSettings(request: Request, env: Env, agent: Agent): Promise<Response>;
export declare function handleStats(env: Env): Promise<Response>;
