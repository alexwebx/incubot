import nodemailer from "nodemailer";

function getEmailConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !port || !user || !pass || !from) {
    throw new Error(
      "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM are required for email delivery",
    );
  }

  return {
    host,
    port: Number(port),
    user,
    pass,
    from,
  };
}

async function sendEmail(options: { to: string; subject: string; text: string; html: string }) {
  const config = getEmailConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.sendMail({
    from: config.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}

function getAppUrl() {
  return process.env.APP_URL || "https://incubot.vercel.app/";
}

export async function sendApprovalEmail(email: string) {
  const appUrl = getAppUrl();

  await sendEmail({
    to: email,
    subject: "Доступ к Incubot согласован",
    text: `Ваш доступ к Incubot согласован. Откройте ${appUrl} и войдите в кабинет.`,
    html: `<p>Ваш доступ к Incubot согласован.</p><p>Откройте <a href="${appUrl}">${appUrl}</a> и войдите в кабинет.</p>`,
  });
}

export async function sendRecoveredPasswordEmail(email: string, password: string) {
  const appUrl = getAppUrl();

  await sendEmail({
    to: email,
    subject: "Новый пароль для Incubot",
    text: `Для вашего аккаунта сгенерирован новый пароль: ${password}\n\nСайт: ${appUrl}`,
    html: `<p>Для вашего аккаунта сгенерирован новый пароль:</p><p><strong>${password}</strong></p><p>Сайт: <a href="${appUrl}">${appUrl}</a></p>`,
  });
}
