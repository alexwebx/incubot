export type MessageDirection = "incoming" | "outgoing";

export type Message = {
  id: string;
  telegram_chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  text: string | null;
  created_at: string;
  direction: MessageDirection;
};

export type MessageGroup = {
  telegram_chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  messages: Message[];
  latest_message_at: string;
};

export function groupMessages(messages: Message[]): MessageGroup[] {
  const groups = new Map<string, MessageGroup>();

  for (const message of messages) {
    const group = groups.get(message.telegram_chat_id);

    if (group) {
      group.messages.push(message);

      if (new Date(message.created_at).getTime() > new Date(group.latest_message_at).getTime()) {
        group.latest_message_at = message.created_at;
      }

      continue;
    }

    groups.set(message.telegram_chat_id, {
      telegram_chat_id: message.telegram_chat_id,
      username: message.username,
      first_name: message.first_name,
      last_name: message.last_name,
      messages: [message],
      latest_message_at: message.created_at,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      messages: [...group.messages].sort(
        (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      ),
    }))
    .sort(
      (left, right) =>
        new Date(right.latest_message_at).getTime() - new Date(left.latest_message_at).getTime(),
    );
}

export function getDisplayName(group: Pick<MessageGroup, "first_name" | "last_name" | "username">): string {
  const fullName = [group.first_name, group.last_name].filter(Boolean).join(" ").trim();

  if (fullName) {
    return fullName;
  }

  if (group.username) {
    return `@${group.username}`;
  }

  return "Unknown user";
}

export function getMessagePreview(message: Message | undefined): string {
  if (!message?.text?.trim()) {
    return "Empty message";
  }

  return message.text;
}
