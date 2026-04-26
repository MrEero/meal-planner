# Step 1 — Supabase project setup

Goal: create a Supabase project in EU Central (Frankfurt), run the schema,
copy two credentials, send them back to me. Roughly 10 minutes.

## 1. Sign up

Go to **https://supabase.com** and click **Start your project**.

Sign in with **GitHub** (easiest — same account as your meal-planner repo).
You'll land on the Supabase dashboard.

## 2. Create the project

Click **New project**.

- **Organization**: leave default (Supabase makes one for you the first time).
- **Name**: `perekonna-toiduplaan`
- **Database password**: click **Generate a password**, then **copy it to a
  safe place** (1Password, Apple Keychain, sticky note, whatever). You will
  need this exactly once if you ever want raw SQL access later.
- **Region**: **Central EU (Frankfurt)** — this is the one you picked.
- **Pricing plan**: **Free**.

Click **Create new project**. Provisioning takes about 2 minutes. While it
spins up, do step 3.

## 3. Run the schema

Once the project is ready, the dashboard shows the project home.

In the left sidebar, click **SQL Editor** (the icon that looks like `>_`).

Click **New query**, then paste the **entire contents** of `schema.sql`
(in this same `v2-cloud` folder) into the editor.

Click **Run** (bottom right). You should see `Success. No rows returned.`
If it errors, copy the error message and send it to me.

## 4. Confirm tables are there

Left sidebar → **Table Editor**. You should see:

- `households`
- `profiles`
- `meal_plans`
- `shopping_state`
- `prisma_queue`
- `weight_log`

If they're all there, the schema worked.

## 5. Copy the credentials I need

Left sidebar → **Project Settings** (gear icon at the bottom) → **API**.

There are two values I need. Copy them and paste them in chat:

1. **Project URL** — looks like `https://abcdefghijklmno.supabase.co`
2. **anon public key** — long string starting with `eyJ...` (this is safe to
   put in client-side code; it's the public key)

**Do NOT send me the `service_role` secret key.** That one stays in the
Supabase dashboard. We don't need it for the planner.

## 6. Tell me when done

Just paste those two values in chat. While you do this step, I'll prep the
next pieces (Google OAuth setup + the new auth-aware planner code) in
parallel so we can move fast.

---

## What you just did

You set up a real Postgres database in Frankfurt with row-level security.
Every table is locked so users can only read/write data belonging to their
own household. The auth system (next step) ties browser sessions to user
rows, and everything flows from there.
