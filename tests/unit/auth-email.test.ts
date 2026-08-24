import { describe,expect,it,vi } from "vitest";

vi.mock("server-only",()=>({}));

import { isAccountExistenceError, neutralResendMessage, pendingConfirmationMessage, publicAuthEmailError, reportAuthEmailFailure } from "@/lib/auth-email";

describe("produkční Auth e-maily",()=>{
  it("rozlišuje SMTP a rate-limit chybu bez vracení interní zprávy",()=>{
    expect(publicAuthEmailError({code:"email_address_not_authorized",status:500,message:"Email address not authorized"})).toEqual({status:503,message:expect.stringContaining("dočasně nedostupné")});
    expect(publicAuthEmailError({code:"over_email_send_rate_limit",status:429})).toEqual({status:429,message:expect.stringContaining("Limit")});
  });

  it("existující účet řeší neutrálním potvrzovacím tokem",()=>{
    expect(isAccountExistenceError({code:"user_already_exists"})).toBe(true);
    expect(pendingConfirmationMessage).toBe("Účet je založený a čeká na potvrzení e-mailu.");
    expect(neutralResendMessage).not.toMatch(/existuje|neexistuje/i);
  });

  it("serverový log nikdy nezapisuje zprávu poskytovatele s e-mailem",()=>{
    const spy=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    reportAuthEmailFailure("resend",{code:"smtp_failed",status:500,message:"secret.student@example.cz"});
    expect(JSON.stringify(spy.mock.calls)).not.toContain("secret.student@example.cz");
    expect(spy).toHaveBeenCalledWith("StudentHub Auth e-mail selhal.",{operation:"resend",code:"smtp_failed",status:500});
    spy.mockRestore();
  });
});
