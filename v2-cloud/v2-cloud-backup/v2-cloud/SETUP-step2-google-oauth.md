# Step 2 — Google OAuth setup

Goal: create a Google OAuth client so your family can sign in with Google.
Roughly 10 minutes. Do this AFTER Step 1 (Supabase project exists).

You'll need your **Supabase project URL** from Step 1 (looks like
`https://abcdefghijklmno.supabase.co`).

## 1. Open Google Cloud Console

Go to **https://console.cloud.google.com** and sign in with the Google
account you want to own this OAuth app (use the family Google account if
you have one, or your personal).

## 2. Create a project

Top bar → project picker → **New project**.

- **Project name**: `retsept-app`
- **Location**: leave default (No organization)

Click **Create**, wait 10 seconds, then make sure the new project is
selected in the top bar.

## 3. Configure the OAuth consent screen

Left sidebar → **APIs & Services** → **OAuth consent screen**.

- **User type**: **External** (this means anyone with a Google account can
  sign in, which is what you want for family members on different Google
  accounts). Click **Create**.

Fill in the bare minimum:

- **App name**: `Retsept`
- **User support email**: your email
- **App logo**: skip
- **App domain**: `retsept.app` (yes, even though it isn't live yet)
- **Authorized domains**: add `supabase.co` AND `retsept.app`
- **Developer contact email**: your email

Click **Save and Continue**.

**Scopes**: just click **Save and Continue** — defaults are fine.

**Test users**: add the Google emails of every family member who'll log in
(you, your wife, anyone else). Click **Save and Continue**.

**Summary**: scroll to the bottom, click **Back to Dashboard**.

> Note: the app will be in "Testing" mode, which is fine for a 3-person
> family. To remove the "test users" limit you'd need Google verification,
> which is overkill for a private family tool.

## 4. Create the OAuth client

Left sidebar → **Credentials** → **Create Credentials** → **OAuth client ID**.

- **Application type**: **Web application**
- **Name**: `Retsept Web Client`

Under **Authorized JavaScript origins**, click **Add URI** and add both:

- `https://retsept.app`
- `http://localhost:5173` (for local testing)

Under **Authorized redirect URIs**, click **Add URI** and add:

- `https://YOUR_SUPABASE_REF.supabase.co/auth/v1/callback`

Replace `YOUR_SUPABASE_REF` with the part before `.supabase.co` in your
project URL. So if your Supabase URL is `https://abcdef.supabase.co`, the
redirect URI is `https://abcdef.supabase.co/auth/v1/callback`.

Click **Create**.

A modal pops up showing **Your Client ID** and **Your Client Secret**.
Keep this modal open — you need both values for Step 5.

## 5. Plug Google into Supabase

Open Supabase dashboard for your project.

Left sidebar → **Authentication** → **Providers** → click **Google**.

- Toggle **Enable Sign in with Google** to on
- **Client IDs**: paste the Google **Client ID** from step 4
- **Client Secret**: paste the Google **Client Secret** from step 4
- Leave the other fields default
- Click **Save**

## 6. Test

In the same Supabase **Authentication** screen, scroll to **URL
Configuration**.

- **Site URL**: `https://retsept.app` (or `http://localhost:5173` for local)
- **Redirect URLs**: add `https://retsept.app/**` and
  `http://localhost:5173/**`

Click **Save**.

You're done with Step 2. The next time you sign in to the planner via
Google, Supabase handles the OAuth dance for you.

## 7. Send me

Just say "Step 2 done" in chat. I don't need any new credentials from you
— the Google client ID/secret stay in Supabase, never in the planner code.
