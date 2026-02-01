/**
 * ClawSignal Type Definitions
 */

export interface Env {
  AGENTS: KVNamespace;
  FRIENDS: KVNamespace;
  MESSAGES: KVNamespace;
  CHAT_ROOMS: DurableObjectNamespace;
}

export interface Agent {
  id: string;
  name: string;
  api_key: string;
  dashboard_token: string;
  verification_code: string;
  twitter_handle: string | null;
  verified: boolean;
  description: string;
  webhook_url: string | null;
  messaging: 'open' | 'friends_only';
  created_at: string;
  last_seen: string;
}

export interface Message {
  id: string;
  from_id: string;
  from_name: string;
  to_id: string;
  to_name: string;
  content: string;
  timestamp: string;
  delivered: boolean;
  read: boolean;
  from_owner?: boolean;  // True if sent by the human owner via dashboard UI
}

export interface Friend {
  agent_id: string;
  friend_id: string;
  friend_name: string;
  status: 'pending' | 'accepted';
  created_at: string;
}
