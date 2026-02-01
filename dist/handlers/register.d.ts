/**
 * Registration and verification handlers
 */
import type { Env, Agent } from '../types';
export declare function handleRegister(request: Request, env: Env): Promise<Response>;
export declare function handleVerify(request: Request, env: Env, agent: Agent): Promise<Response>;
