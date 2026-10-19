# StudentHub Auth emails

Production Supabase project: StudentHub (`srpkoiaciwmaneycyxye`). These files are
the source-controlled copies of the templates deployed in Authentication → Emails.
Changing a file alone does not update the hosted Supabase configuration.

| Supabase template | File | Subject |
| --- | --- | --- |
| Confirm sign up | `confirmation.html` | Potvrď svůj e-mail – StudentHub |
| Reset password | `recovery.html` | Obnova hesla – StudentHub |

Keep `{{ .ConfirmationURL }}` intact: Supabase supplies the single-use link and
the existing `/auth/callback` exchanges its PKCE code. Do not insert static tokens,
tracking links or localhost URLs. `{{ .SiteURL }}` comes from the project setting.

Production uses custom Resend SMTP over port 465. The sender display name is
StudentHub; the authenticated sending domain is `auth.studenthubapp.cz`. Secrets
belong only in secured Supabase settings, never in these templates or public env.
The support contact in the message is `studenthubbrno@gmail.com`; this does not
claim that an SMTP Reply-To header is configured.

The opt-in `scripts/release-audit/auth-mail-session.mjs` supports an isolated mail
test with a specifically authorized Gmail plus-address. It keeps passwords and
links in memory, disables terminal echo and removes only its own temporary user.
Actual inbox receipt, SPF/DKIM/DMARC, confirmation/session and recovery must be
verified separately; an HTTP 201 response alone is not proof of delivery.
