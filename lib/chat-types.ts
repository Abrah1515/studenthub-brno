export type ChatContextType = "profile" | "buddy_post" | "marketplace_listing";
export type ChatConversationStatus = "requested" | "active" | "declined" | "restricted" | "left";

export type ChatIdentity = {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl?: string;
};

export type ChatContext = {
  type: ChatContextType;
  id: string;
  title: string;
  detail?: string;
  href: string | null;
  active: boolean;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  body: string;
  state: "active" | "hidden" | "deleted";
  createdAt: string;
  own: boolean;
};

export type ChatConversation = {
  id: string;
  status: ChatConversationStatus;
  requestedByMe: boolean;
  canSend: boolean;
  canAccept: boolean;
  archived: boolean;
  mutedUntil: string | null;
  other: ChatIdentity;
  context: ChatContext;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
};
