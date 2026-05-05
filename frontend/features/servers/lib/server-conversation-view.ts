import type {
  ServerChannelMemberItem,
  ServerConversationMessage,
  ServerUserPublicProfile,
} from "@/features/servers/model/types";

export interface MentionCandidate {
  id: string;
  label: string;
  handle: string;
  kind: "agent" | "human";
  description?: string | null;
}

export function getUserDisplayName(
  profile: ServerUserPublicProfile | null | undefined,
  fallbackUserId?: string | null,
): string {
  const displayName = profile?.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  return fallbackUserId?.trim() || "User";
}

export function getUserAvatarUrl(
  profile: ServerUserPublicProfile | null | undefined,
): string | null {
  const avatarUrl = profile?.avatarUrl?.trim();
  return avatarUrl || null;
}

function getMessageTimestamp(message: ServerConversationMessage): number {
  const timestamp = Date.parse(message.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function sortMessagesChronologically(
  messages: ServerConversationMessage[],
): ServerConversationMessage[] {
  return [...messages].sort((left, right) => {
    const timestampDiff = getMessageTimestamp(left) - getMessageTimestamp(right);
    if (timestampDiff !== 0) {
      return timestampDiff;
    }
    return left.id.localeCompare(right.id);
  });
}

export function buildHumanMentionCandidates(
  members: ServerChannelMemberItem[],
  currentUserId?: string | null,
): MentionCandidate[] {
  const excludedUserId = currentUserId?.trim();
  return members
    .filter((member) => !excludedUserId || member.userId !== excludedUserId)
    .map((member) => ({
      id: member.userId,
      label: getUserDisplayName(member.user, member.userId),
      handle: member.userId,
      kind: "human",
    }));
}

export function messageMentionsUser(
  message: ServerConversationMessage,
  userId?: string | null,
): boolean {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) {
    return false;
  }

  const text =
    typeof message.content.text === "string"
      ? message.content.text
      : (message.textPreview ?? "");
  const mentionPattern = new RegExp(
    `(^|\\s)@${normalizedUserId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|\\s|[,.!?;:])`,
    "i",
  );
  return mentionPattern.test(text);
}

export function hasInboxSignal(
  message: ServerConversationMessage,
  userId?: string | null,
): boolean {
  return messageMentionsUser(message, userId) || message.replyCount > 0;
}
