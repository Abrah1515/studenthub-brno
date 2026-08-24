import "server-only";

export type AuthEmailError = {
  code?: string;
  message?: string;
  status?: number;
};

export const pendingConfirmationMessage = "Účet je založený a čeká na potvrzení e-mailu.";
export const neutralResendMessage = "Pokud je adresa způsobilá k potvrzení, požadavek na nový e-mail jsme přijali.";

const rateLimitCodes = new Set([
  "email_rate_limit_exceeded",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "rate_limit_exceeded",
  "too_many_requests",
]);

const accountExistenceCodes = new Set([
  "email_exists",
  "user_already_exists",
  "user_already_registered",
]);

export function isAuthEmailRateLimit(error: AuthEmailError) {
  return error.status === 429 || rateLimitCodes.has(error.code || "");
}

export function isAuthEmailDeliveryFailure(error: AuthEmailError) {
  const message = (error.message || "").toLowerCase();
  return error.code === "email_address_not_authorized"
    || error.code === "email_send_failed"
    || error.code === "smtp_failed"
    || message.includes("smtp")
    || message.includes("email address not authorized")
    || message.includes("error sending");
}

export function isAccountExistenceError(error: AuthEmailError) {
  const message = (error.message || "").toLowerCase();
  return accountExistenceCodes.has(error.code || "") || message.includes("already registered");
}

export function publicAuthEmailError(error: AuthEmailError) {
  if (isAuthEmailRateLimit(error)) {
    return {
      status: 429,
      message: "Limit odesílání e-mailů byl dočasně vyčerpán. Počkejte prosím a zkuste to později.",
    };
  }
  if (isAuthEmailDeliveryFailure(error) || (error.status || 0) >= 500) {
    return {
      status: 503,
      message: "Odesílání ověřovacích e-mailů je teď dočasně nedostupné. Zkuste to prosím později.",
    };
  }
  return {
    status: 400,
    message: "Požadavek se nepodařilo bezpečně dokončit. Zkontrolujte údaje a zkuste to znovu.",
  };
}

export function reportAuthEmailFailure(operation: "signup" | "resend" | "recovery", error: AuthEmailError) {
  // Zpráva poskytovatele může obsahovat adresu nebo odkaz, proto ji nikdy nelogujeme.
  console.error("StudentHub Auth e-mail selhal.", {
    operation,
    code: error.code || "unknown",
    status: error.status || null,
  });
}
