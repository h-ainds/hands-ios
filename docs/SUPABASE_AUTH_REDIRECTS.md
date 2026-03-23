# Supabase redirect URLs (Expo / OAuth)

If **Google or Apple login** finishes in **Safari on your production website** (e.g. `app.handsforu…`) instead of returning to the app, Supabase is **not allowlisting** the `redirectTo` URL your app sends. When that happens, Supabase falls back to **Site URL** from:

**Dashboard → Authentication → URL Configuration**

## Fix (required)

Under **Redirect URLs**, add **both** patterns (wildcards are supported by Supabase):

| Pattern | Use |
|--------|-----|
| `exp://**` | **Expo Go** – `redirectTo` looks like `exp://192.168.x.x:8081/--/auth-callback` (IP/port change). |
| `handsios://**` | **Dev builds / TestFlight / App Store** – custom scheme from `app.json`. |

Also keep any exact URLs you use for **web** (e.g. `http://localhost:8081/**`).

After saving, try OAuth again. The in-app browser should close and return to your dev app.

## Optional: exact URL instead of `exp://**`

1. Run the app and tap **Continue with Google** (or Apple).
2. In Metro logs, find: `Google OAuth Redirect URL: ...`
3. Copy that **exact** string into **Redirect URLs** in Supabase.

You’ll need to add a new line whenever your LAN IP or Metro port changes unless you use `exp://**`.

## Optional env override

Set `EXPO_PUBLIC_SUPABASE_REDIRECT_URL` to a **full** redirect base you’ve allowlisted (e.g. tunnel URL) if you don’t want to use wildcards. Query params (e.g. `type=recovery`) are appended automatically.

## Email / password login

Email + password does **not** use `redirectTo`. If only **OAuth** sends you to the website, the issue is the redirect allow list above.

## Signup confirmation & “magic link” / verification email

If **no email arrives** after sign up:

1. **Supabase → Authentication → Providers → Email**  
   - Turn **Confirm email** **ON**. If it’s off, Supabase creates the user and returns a session immediately and **does not send** a confirmation email.

2. **Redirect URLs** (same section as OAuth)  
   The app passes `emailRedirectTo` (your `auth-callback` deep link / web URL). That URL **must** match an entry in **Redirect URLs** (e.g. `exp://**`, `handsios://**`, or your exact URL). If it doesn’t, confirmation emails can fail or links won’t open the app correctly.

3. **Auth logs & SMTP**  
   - **Authentication → Logs** for delivery errors.  
   - Default Supabase email is rate-limited; for reliable delivery use **Custom SMTP** (or a provider like Resend) in **Project Settings → Auth**.

4. **OTP vs link**  
   Your **Verify email** screen expects a **6-digit code** if the Supabase **Confirm signup** template uses `{{ .Token }}`. If the template only includes a **confirmation link** (`{{ .ConfirmationURL }}`), users should use the link (it should open the app via `emailRedirectTo`) rather than a code.

5. **“No email” but signup seems to work**  
   - **Email already registered:** Supabase returns a user with **empty `identities`** and **no session**. The app now shows an error: sign in instead — **no signup email is sent** for duplicates.  
   - **Confirm email OFF:** You get a session immediately and **no email** — enable **Confirm email** if you want messages.

6. **Optional: `EXPO_PUBLIC_EMAIL_CONFIRMATION_REDIRECT_URL`**  
   Set to an **https** URL you control (allowlisted), if deep links like `exp://…` in emails never arrive or get stripped. That page should redirect users into the app (universal link or custom scheme).
