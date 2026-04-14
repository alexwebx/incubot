import type { AppUser, PublicUser } from "@/lib/auth";
import type {
  ClientRecord,
  DialogAssignment,
  DialogMessage,
  DialogRecord,
  InboxDialog,
} from "@/lib/dialogs";
import { findUserById, listAssignableUsers } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";

type DialogsData = {
  dialogs: InboxDialog[];
  assignableUsers: PublicUser[];
};

type TelegramClientInput = {
  telegramUserId?: number | null;
  telegramChatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

function sortDialogs(dialogs: InboxDialog[]) {
  return [...dialogs].sort(
    (left, right) =>
      new Date(right.latest_message_at).getTime() - new Date(left.latest_message_at).getTime(),
  );
}

function mapPublicUsersById(users: PublicUser[]) {
  return new Map(users.map((user) => [user.id, user]));
}

async function listVisibleDialogIds(currentUser: AppUser) {
  if (currentUser.role === "admin") {
    const { data, error } = await getSupabaseAdmin()
      .from("dialogs")
      .select("id")
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => row.id as string);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("dialog_assignments")
    .select("dialog_id")
    .eq("manager_id", currentUser.id)
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return Array.from(new Set((data ?? []).map((row) => row.dialog_id as string)));
}

async function getDialogsByIds(dialogIds: string[]) {
  if (dialogIds.length === 0) {
    return [];
  }

  const { data, error } = await getSupabaseAdmin()
    .from("dialogs")
    .select("id, client_id, status, created_at, updated_at, closed_at")
    .in("id", dialogIds)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as (DialogRecord & { client_id: string })[];
}

async function getClientsByIds(clientIds: string[]) {
  if (clientIds.length === 0) {
    return [];
  }

  const { data, error } = await getSupabaseAdmin()
    .from("clients")
    .select(
      "id, telegram_user_id, telegram_chat_id, username, first_name, last_name, created_at, updated_at",
    )
    .in("id", clientIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ClientRecord[];
}

async function getMessagesByDialogIds(dialogIds: string[]) {
  if (dialogIds.length === 0) {
    return [];
  }

  const { data, error } = await getSupabaseAdmin()
    .from("messages")
    .select("id, dialog_id, client_id, manager_id, sender_type, text, created_at")
    .in("dialog_id", dialogIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DialogMessage[];
}

async function getActiveAssignments(dialogIds: string[]) {
  if (dialogIds.length === 0) {
    return [];
  }

  const { data, error } = await getSupabaseAdmin()
    .from("dialog_assignments")
    .select("id, dialog_id, manager_id, assigned_by, assigned_at, unassigned_at, is_active, updated_at")
    .in("dialog_id", dialogIds)
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DialogAssignment[];
}

export async function loadInboxData(currentUser: AppUser): Promise<DialogsData> {
  const dialogIds = await listVisibleDialogIds(currentUser);

  if (dialogIds.length === 0) {
    return {
      dialogs: [],
      assignableUsers: await listAssignableUsers(currentUser),
    };
  }

  const [dialogs, messages, assignments, assignableUsers] = await Promise.all([
    getDialogsByIds(dialogIds),
    getMessagesByDialogIds(dialogIds),
    getActiveAssignments(dialogIds),
    listAssignableUsers(currentUser),
  ]);

  const clients = await getClientsByIds(dialogs.map((dialog) => dialog.client_id));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const messagesByDialogId = new Map<string, DialogMessage[]>();
  const assignmentsByDialogId = new Map(assignments.map((assignment) => [assignment.dialog_id, assignment]));
  const assignableUsersById = mapPublicUsersById(assignableUsers);

  for (const message of messages) {
    const existingMessages = messagesByDialogId.get(message.dialog_id);

    if (existingMessages) {
      existingMessages.push(message);
      continue;
    }

    messagesByDialogId.set(message.dialog_id, [message]);
  }

  const inboxDialogs = dialogs
    .map((dialog) => {
      const client = clientsById.get(dialog.client_id);

      if (!client) {
        return null;
      }

      const dialogMessages = messagesByDialogId.get(dialog.id) ?? [];
      const latestMessageAt =
        dialogMessages[dialogMessages.length - 1]?.created_at ?? dialog.updated_at ?? dialog.created_at;
      const activeAssignment = assignmentsByDialogId.get(dialog.id) ?? null;

      return {
        id: dialog.id,
        status: dialog.status,
        created_at: dialog.created_at,
        updated_at: dialog.updated_at,
        closed_at: dialog.closed_at,
        client,
        messages: dialogMessages,
        active_assignment: activeAssignment,
        assigned_manager: activeAssignment
          ? assignableUsersById.get(activeAssignment.manager_id) ?? null
          : null,
        latest_message_at: latestMessageAt,
      } satisfies InboxDialog;
    })
    .filter((dialog): dialog is InboxDialog => dialog !== null);

  return {
    dialogs: sortDialogs(inboxDialogs),
    assignableUsers,
  };
}

export async function findDialogById(dialogId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("dialogs")
    .select("id, client_id, status, created_at, updated_at, closed_at")
    .eq("id", dialogId)
    .maybeSingle<(DialogRecord & { client_id: string })>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getActiveAssignment(dialogId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("dialog_assignments")
    .select("id, dialog_id, manager_id, assigned_by, assigned_at, unassigned_at, is_active, updated_at")
    .eq("dialog_id", dialogId)
    .eq("is_active", true)
    .maybeSingle<DialogAssignment>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function ensureDialogAccess(dialogId: string, currentUser: AppUser) {
  const dialog = await findDialogById(dialogId);

  if (!dialog) {
    throw new Error("Dialog not found");
  }

  if (currentUser.role === "admin") {
    return dialog;
  }

  const assignment = await getActiveAssignment(dialogId);

  if (!assignment || assignment.manager_id !== currentUser.id) {
    throw new Error("Forbidden");
  }

  return dialog;
}

export async function upsertTelegramClient(input: TelegramClientInput) {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("clients")
    .upsert(
      {
        telegram_user_id: input.telegramUserId ?? null,
        telegram_chat_id: input.telegramChatId,
        username: input.username ?? null,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
        updated_at: now,
      },
      { onConflict: "telegram_chat_id" },
    )
    .select(
      "id, telegram_user_id, telegram_chat_id, username, first_name, last_name, created_at, updated_at",
    )
    .single<ClientRecord>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function findOrCreateOpenDialog(clientId: string) {
  const { data: existingDialog, error: existingDialogError } = await getSupabaseAdmin()
    .from("dialogs")
    .select("id, client_id, status, created_at, updated_at, closed_at")
    .eq("client_id", clientId)
    .eq("status", "open")
    .maybeSingle<(DialogRecord & { client_id: string })>();

  if (existingDialogError) {
    throw new Error(existingDialogError.message);
  }

  if (existingDialog) {
    return existingDialog;
  }

  const now = new Date().toISOString();
  const { data: createdDialog, error: createDialogError } = await getSupabaseAdmin()
    .from("dialogs")
    .insert({
      client_id: clientId,
      status: "open",
      created_at: now,
      updated_at: now,
    })
    .select("id, client_id, status, created_at, updated_at, closed_at")
    .single<(DialogRecord & { client_id: string })>();

  if (createDialogError) {
    throw new Error(createDialogError.message);
  }

  return createdDialog;
}

export async function createIncomingMessage(input: {
  telegramUserId?: number | null;
  telegramChatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  text: string;
}) {
  const client = await upsertTelegramClient({
    telegramUserId: input.telegramUserId,
    telegramChatId: input.telegramChatId,
    username: input.username,
    firstName: input.firstName,
    lastName: input.lastName,
  });
  const dialog = await findOrCreateOpenDialog(client.id);
  const now = new Date().toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from("messages")
    .insert({
      dialog_id: dialog.id,
      client_id: client.id,
      manager_id: null,
      sender_type: "client",
      text: input.text,
      created_at: now,
    })
    .select("id, dialog_id, client_id, manager_id, sender_type, text, created_at")
    .single<DialogMessage>();

  if (error) {
    throw new Error(error.message);
  }

  const { error: dialogUpdateError } = await getSupabaseAdmin()
    .from("dialogs")
    .update({ updated_at: now })
    .eq("id", dialog.id);

  if (dialogUpdateError) {
    throw new Error(dialogUpdateError.message);
  }

  return { client, dialog, message: data };
}

export async function createOutgoingMessage(dialogId: string, currentUser: AppUser, text: string) {
  const dialog = await ensureDialogAccess(dialogId, currentUser);
  const now = new Date().toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from("messages")
    .insert({
      dialog_id: dialog.id,
      client_id: null,
      manager_id: currentUser.id,
      sender_type: "manager",
      text,
      created_at: now,
    })
    .select("id, dialog_id, client_id, manager_id, sender_type, text, created_at")
    .single<DialogMessage>();

  if (error) {
    throw new Error(error.message);
  }

  const { error: updateDialogError } = await getSupabaseAdmin()
    .from("dialogs")
    .update({ updated_at: now })
    .eq("id", dialog.id);

  if (updateDialogError) {
    throw new Error(updateDialogError.message);
  }

  return data;
}

export async function assignDialog(dialogId: string, targetManagerId: string, currentUser: AppUser) {
  const dialog = await findDialogById(dialogId);

  if (!dialog) {
    throw new Error("Dialog not found");
  }

  const targetManager = await findUserById(targetManagerId);

  if (!targetManager) {
    throw new Error("Manager not found");
  }

  if (targetManager.role === "manager" && !targetManager.is_approved) {
    throw new Error("Manager is not approved");
  }

  if (currentUser.role === "manager" && currentUser.id !== targetManagerId) {
    throw new Error("Forbidden");
  }

  if (currentUser.role === "admin" && targetManager.role === "admin" && targetManager.id !== currentUser.id) {
    throw new Error("Forbidden");
  }

  const existingAssignment = await getActiveAssignment(dialogId);

  if (existingAssignment?.manager_id === targetManagerId) {
    return existingAssignment;
  }

  const now = new Date().toISOString();

  if (existingAssignment) {
    const { error: deactivateError } = await getSupabaseAdmin()
      .from("dialog_assignments")
      .update({
        is_active: false,
        unassigned_at: now,
        updated_at: now,
      })
      .eq("id", existingAssignment.id);

    if (deactivateError) {
      throw new Error(deactivateError.message);
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from("dialog_assignments")
    .insert({
      dialog_id: dialogId,
      manager_id: targetManagerId,
      assigned_by: currentUser.id,
      assigned_at: now,
      is_active: true,
      updated_at: now,
    })
    .select("id, dialog_id, manager_id, assigned_by, assigned_at, unassigned_at, is_active, updated_at")
    .single<DialogAssignment>();

  if (error) {
    throw new Error(error.message);
  }

  const { error: updateDialogError } = await getSupabaseAdmin()
    .from("dialogs")
    .update({ updated_at: now })
    .eq("id", dialogId);

  if (updateDialogError) {
    throw new Error(updateDialogError.message);
  }

  return data;
}
