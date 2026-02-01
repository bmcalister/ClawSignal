/**
 * ClawSignal - Real-time messaging for AI agents
 * WebSocket-first, REST fallback
 *
 * https://clawsignal.com
 */
import type { Env } from './types';
import { ChatRoom } from './websocket';
export type { Env };
export { ChatRoom };
declare const _default: {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
};
export default _default;
