"use client";

import { useState } from "react";

type AuthView = "login" | "register" | "recover";

type ApiResponse = {
  error?: string;
  message?: string;
};

async function postJson(url: string, body: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as ApiResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

export function AuthShell() {
  const [activeView, setActiveView] = useState<AuthView>("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [recoverEmail, setRecoverEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleLogin() {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await postJson("/api/auth/login", {
        email: loginEmail,
        password: loginPassword,
      });

      window.location.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister() {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await postJson("/api/auth/register", {
        fullName: registerName,
        email: registerEmail,
        password: registerPassword,
      });

      setSuccessMessage("Заявка на регистрацию отправлена. Дождитесь согласования администратором.");
      setActiveView("login");
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRecover() {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload = await postJson("/api/auth/recover", {
        email: recoverEmail,
      });

      setSuccessMessage(payload.message ?? "Письмо отправлено.");
      setRecoverEmail("");
      setActiveView("login");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Recovery failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="authPage">
      <section className="authHero">
        <div className="authHeroInner">
          <p className="eyebrow">Incubot Access</p>
          <h1 className="authTitle">Закрытый кабинет для работы с Telegram-диалогами</h1>
          <p className="authSubtitle">
            Вход для админа и менеджеров. Регистрация менеджера требует согласования администратора.
          </p>
        </div>
      </section>

      <section className="authCard">
        <div className="authTabs">
          <button
            type="button"
            className={`authTab${activeView === "login" ? " active" : ""}`}
            onClick={() => setActiveView("login")}
          >
            Авторизация
          </button>
          <button
            type="button"
            className={`authTab${activeView === "register" ? " active" : ""}`}
            onClick={() => setActiveView("register")}
          >
            Регистрация
          </button>
          <button
            type="button"
            className={`authTab${activeView === "recover" ? " active" : ""}`}
            onClick={() => setActiveView("recover")}
          >
            Восстановление
          </button>
        </div>

        {errorMessage ? <p className="errorBanner">{errorMessage}</p> : null}
        {successMessage ? <p className="successBanner">{successMessage}</p> : null}

        {activeView === "login" ? (
          <div className="authModal">
            <h2>Войти в кабинет</h2>
            <input
              className="authInput"
              type="email"
              placeholder="Email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
            />
            <input
              className="authInput"
              type="password"
              placeholder="Пароль"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
            />
            <button type="button" className="primaryWideButton" onClick={handleLogin} disabled={isSubmitting}>
              {isSubmitting ? "Входим..." : "Войти"}
            </button>
            <div className="authLinks">
              <button type="button" onClick={() => setActiveView("register")}>
                Регистрация
              </button>
              <button type="button" onClick={() => setActiveView("recover")}>
                Восстановить пароль
              </button>
            </div>
          </div>
        ) : null}

        {activeView === "register" ? (
          <div className="authModal">
            <h2>Регистрация менеджера</h2>
            <input
              className="authInput"
              type="text"
              placeholder="Имя"
              value={registerName}
              onChange={(event) => setRegisterName(event.target.value)}
            />
            <input
              className="authInput"
              type="email"
              placeholder="Email"
              value={registerEmail}
              onChange={(event) => setRegisterEmail(event.target.value)}
            />
            <input
              className="authInput"
              type="password"
              placeholder="Пароль"
              value={registerPassword}
              onChange={(event) => setRegisterPassword(event.target.value)}
            />
            <button
              type="button"
              className="primaryWideButton"
              onClick={handleRegister}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Отправляем..." : "Отправить заявку"}
            </button>
          </div>
        ) : null}

        {activeView === "recover" ? (
          <div className="authModal">
            <h2>Восстановление пароля</h2>
            <input
              className="authInput"
              type="email"
              placeholder="Email"
              value={recoverEmail}
              onChange={(event) => setRecoverEmail(event.target.value)}
            />
            <button
              type="button"
              className="primaryWideButton"
              onClick={handleRecover}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Генерируем..." : "Получить новый пароль"}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
