import type { PublicUser } from "@/lib/auth";

export type DialogStatus = "open" | "closed";
export type SenderType = "client" | "manager";

export type ClientRecord = {
  id: string;
  telegram_user_id: number | null;
  telegram_chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  updated_at: string;
};

export type DialogMessage = {
  id: string;
  dialog_id: string;
  client_id: string | null;
  manager_id: string | null;
  sender_type: SenderType;
  text: string;
  created_at: string;
};

export type DialogAssignment = {
  id: string;
  dialog_id: string;
  manager_id: string;
  assigned_by: string | null;
  assigned_at: string;
  unassigned_at: string | null;
  is_active: boolean;
  updated_at: string;
};

export type DialogRecord = {
  id: string;
  status: DialogStatus;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type InboxDialog = DialogRecord & {
  client: ClientRecord;
  messages: DialogMessage[];
  active_assignment: DialogAssignment | null;
  assigned_manager: PublicUser | null;
  latest_message_at: string;
};

export function getClientDisplayName(client: Pick<ClientRecord, "first_name" | "last_name" | "username">) {
  const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ").trim();

  if (fullName) {
    return fullName;
  }

  if (client.username) {
    return `@${client.username}`;
  }

  return "Unknown user";
}

export function getDialogPreview(message: DialogMessage | undefined) {
  if (!message?.text?.trim()) {
    return "Empty message";
  }

  return message.text;
}
