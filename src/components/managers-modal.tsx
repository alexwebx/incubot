"use client";

import { useEffect, useState } from "react";
import type { PublicUser } from "@/lib/auth";

type ManagersModalProps = {
  currentUser: PublicUser;
  isOpen: boolean;
  onClose: () => void;
};

type ManagersResponse = {
  managers?: PublicUser[];
  error?: string;
};

type PasswordChangeResponse = {
  success?: boolean;
  error?: string;
};

export function ManagersModal({ currentUser, isOpen, onClose }: ManagersModalProps) {
  const [managers, setManagers] = useState<PublicUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");

  async function loadManagers() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/managers");
      const payload = (await response.json()) as ManagersResponse;

      if (!response.ok || !payload.managers) {
        throw new Error(payload.error ?? "Failed to load managers");
      }

      setManagers(payload.managers);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load managers");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      void loadManagers();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleApprove(managerId: string) {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/managers/${managerId}/approve`, {
        method: "POST",
      });
      const payload = (await response.json()) as { manager?: PublicUser; error?: string };

      if (!response.ok || !payload.manager) {
        throw new Error(payload.error ?? "Approval failed");
      }

      setManagers((currentManagers) =>
        currentManagers.map((manager) =>
          manager.id === payload.manager?.id ? payload.manager : manager,
        ),
      );
      setSuccessMessage("Менеджер согласован.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Approval failed");
    }
  }

  async function handleAdminPasswordChange(managerId: string) {
    const nextPasswordForManager = passwordDrafts[managerId]?.trim();

    if (!nextPasswordForManager) {
      setErrorMessage("Введите новый пароль для менеджера.");
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/managers/${managerId}/password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nextPassword: nextPasswordForManager,
        }),
      });
      const payload = (await response.json()) as PasswordChangeResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Password update failed");
      }

      setPasswordDrafts((currentDrafts) => ({
        ...currentDrafts,
        [managerId]: "",
      }));
      setSuccessMessage("Пароль менеджера обновлён.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Password update failed");
    }
  }

  async function handleOwnPasswordChange() {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          nextPassword,
        }),
      });
      const payload = (await response.json()) as PasswordChangeResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Password update failed");
      }

      setCurrentPassword("");
      setNextPassword("");
      setSuccessMessage("Пароль обновлён.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Password update failed");
    }
  }

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <section className="modalCard">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Managers</p>
            <h2>{currentUser.role === "admin" ? "Управление менеджерами" : "Мой профиль"}</h2>
          </div>
          <button type="button" className="ghostButton" onClick={onClose}>
            Закрыть
          </button>
        </div>

        {errorMessage ? <p className="errorBanner">{errorMessage}</p> : null}
        {successMessage ? <p className="successBanner">{successMessage}</p> : null}

        {isLoading ? <p className="hintText">Загружаем менеджеров...</p> : null}

        {currentUser.role === "admin" ? (
          <div className="managerList">
            {managers.map((manager) => (
              <article key={manager.id} className="managerCard">
                <div className="managerCardTop">
                  <div>
                    <strong>{manager.full_name || manager.email}</strong>
                    <p className="managerMeta">{manager.email}</p>
                  </div>
                  <span className={`statusBadge${manager.is_approved ? " approved" : ""}`}>
                    {manager.is_approved ? "Согласован" : "Ожидает"}
                  </span>
                </div>

                <div className="managerActions">
                  {!manager.is_approved ? (
                    <button type="button" className="sendButton" onClick={() => handleApprove(manager.id)}>
                      Согласовать
                    </button>
                  ) : null}

                  <input
                    className="authInput compact"
                    type="text"
                    placeholder="Новый пароль"
                    value={passwordDrafts[manager.id] ?? ""}
                    onChange={(event) =>
                      setPasswordDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [manager.id]: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="refreshButton"
                    onClick={() => handleAdminPasswordChange(manager.id)}
                  >
                    Сменить пароль
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="managerCard self">
            <div className="managerCardTop">
              <div>
                <strong>{currentUser.full_name || currentUser.email}</strong>
                <p className="managerMeta">{currentUser.email}</p>
              </div>
              <span className="statusBadge approved">Менеджер</span>
            </div>

            <div className="selfPasswordBlock">
              <input
                className="authInput compact"
                type="password"
                placeholder="Текущий пароль"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              <input
                className="authInput compact"
                type="password"
                placeholder="Новый пароль"
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
              />
              <button type="button" className="sendButton" onClick={handleOwnPasswordChange}>
                Обновить пароль
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
