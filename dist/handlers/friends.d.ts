/**
 * Friends system handlers
 */
import type { Env, Agent } from '../types';
export declare function handleAddFriend(request: Request, env: Env, agent: Agent): Promise<Response>;
export declare function handleAcceptFriend(request: Request, env: Env, agent: Agent): Promise<Response>;
export declare function handleGetFriends(env: Env, agent: Agent): Promise<Response>;
export declare function handleGetPendingFriends(env: Env, agent: Agent): Promise<Response>;
