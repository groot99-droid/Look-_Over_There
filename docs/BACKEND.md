# Backend: accounts, saves and the leaderboard

Status: decided by the owner on 2026-11-07. This is session 5, step 1, in `docs/SESSIONS.md`.

## Decisions

- **Storage:** PostgreSQL as its own service in the existing Railway project (`look-over-there`, production). The owner is on the Hobby plan and will move to Pro when needed.
- **Sign-in:** anonymous first, so there is no sign-up wall. "Continue with Discord" keeps the account across devices. Email sign-in and marketing email come later and are not part of version 1.
- **Audience:** 18 and over.
- **Writers:** only the game server writes run records, scores and flags. A client can never send a time or a score (RND-26 in `docs/ROUND.md`).

## What it has to hold

| Need | Where it comes from |
|---|---|
| An account per player, anonymous or linked to Discord | RND-23, RND-25 |
| The flag `original_complete`, and later keycards and admin access | `shared/farway.manifest.js` `flags` |
| Run records built by the server, with per-player downs, deaths, revives and score | RND-20, RND-21, RND-27 |
| Online leaderboards by mode and group size (solo, 2 to 4, 5 to 10), by time and by score | RND-25 |
| Saves (money, items, level, achievements, found scenes) | GBI-9 |
| Display names that can be moderated, and bans | below |

## What exists today

`server/server.js` is one Node process, deployed on Railway from `main` (service `game`, region ams, one replica). It keeps everything in memory. The best time lives in the browser. Nothing survives a restart.

## Architecture

```
browser ──https──> game server (Node) ──private network──> Postgres service
        <─wss────       │
                        └── Discord (only during sign-in)
```

- The game server talks to Postgres over Railway's private network with `DATABASE_URL`. The database has no public address.
- Storage sits behind one small interface (`server/store/`), with two implementations:
  - an in-memory one, used by every existing test, so the unit tests stay fast and need no database;
  - a Postgres one, with its own tests that run only when `TEST_DATABASE_URL` is set.
- Migrations are plain numbered `.sql` files, applied in order by a small runner that records them in a `schema_migrations` table. The server applies pending ones at start.
- A room still lives in server memory. Postgres holds what must outlive a room.

## Data model (first sketch)

```sql
accounts(id uuid pk, display_name text, kind text check (kind in ('anonymous','linked')),
         adult_confirmed_at timestamptz, banned_at timestamptz, deleted_at timestamptz, created_at timestamptz)
identities(id uuid pk, account_id uuid fk, provider text, provider_user_id text,
           display_name text, avatar_hash text, created_at timestamptz,
           unique (provider, provider_user_id))                         -- provider is 'discord'
sessions(id text pk, account_id uuid fk, created_at timestamptz, expires_at timestamptz, last_seen_at timestamptz)
run_records(id uuid pk, room_code text, mode text, started_at timestamptz, ended_at timestamptz,
            players int, floors jsonb)
run_players(run_id uuid fk, account_id uuid fk, name text, char int, place int, ms int,
            downs int, deaths int, revives int, shots int, score int, primary key (run_id, account_id))
saves(account_id uuid fk, mode text, data jsonb, version int, updated_at timestamptz, primary key (account_id, mode))
flags(account_id uuid fk, flag text, set_at timestamptz, primary key (account_id, flag))
```

- A leaderboard is a query over `run_players` joined to `run_records`, filtered by mode and by group-size bucket (solo is 1 player, 2 to 4, 5 to 10), ordered by time or by score. Indexes on `(mode, players, score desc)` and `(mode, players, ms)` keep it fast.
- Later, for email: `email`, `email_verified_at` on `identities`, and a `consents(account_id, kind, text_version, granted_at, revoked_at)` table. Marketing mail needs its own unticked opt-in, stored with the exact text and the time, never inferred from signing in.

## Sign-in

**Anonymous.** On first visit the server creates an `anonymous` account and a session, and sets an opaque session id in a cookie (`HttpOnly`, `Secure`, `SameSite=Lax`). A WebSocket join reads that cookie. A player who clears the browser loses the account, which is why linking is offered.

**Discord.** Authorization code grant, server side. The facts below are from Discord's OAuth2 page and need a recheck when the session builds it.
- Authorization URL: `https://discord.com/oauth2/authorize?response_type=code&client_id=...&scope=identify&state=...&redirect_uri=...`
- Token URL: `https://discord.com/api/oauth2/token`, a POST with `application/x-www-form-urlencoded` only, `grant_type=authorization_code`, the code and the same `redirect_uri`, and the client ID and secret by Basic auth or in the form.
- The scope is `identify`. It returns the Discord user (id, username, display name, avatar) without an email. The `email` scope is not requested in version 1.
- `state` must be bound to the user's session, and checked on return. The redirect also carries `iss=https://discord.com` (RFC 9207), which must be checked.
- Discord's page recommends PKCE for production apps. The session reads the exact parameters and adds it.
- The server calls `/users/@me` once, stores the Discord id, display name and avatar hash, and discards the access token. No refresh token is kept.

**Linking and merging.** If the signed-in Discord identity has no account yet, the current anonymous account becomes `linked`. If it already has one, that account wins and the anonymous account's progress is merged in: flags are unioned, run records move over, and for saves the one with more progress is kept (the player is told). The owner may change this rule.

**Leaving.** Logout ends the session. "Delete my account" removes the identity and anonymises the player's run rows (the name becomes "Deleted player") so past boards stay consistent.

## Security and privacy

- Writes to `run_records`, `run_players`, `flags` and scores come only from the server's own round code.
- Rate-limit the auth routes and the leaderboard route. Check the `Origin` on state-changing requests. Never log tokens or cookies.
- Secrets live only in Railway variables, never in the repo or in a test: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `DATABASE_URL`.
- Display names come from Discord's display name or are chosen by the player, pass a word filter, and can be reported. An account can be banned.
- A one-time "I am 18 or older" confirmation is stored as `adult_confirmed_at`. It cannot verify age. State the 18+ rule in the terms.
- Keep personal data to the minimum: the Discord id, a display name and an avatar hash. A privacy page and a delete-my-data route are needed at launch, because players in the EU and UK have those rights. This is not legal advice.

## Cost

Railway rates, read from its docs on 2026-11-07: RAM $10 per GB-month, CPU $20 per vCPU-month, volume storage $0.15 per GB-month, public egress $0.05 per GB. Hobby is $5 a month with $5 of usage included, and Pro is $20 a month with $20 included.

- The `game` service used about 23 MB of RAM and almost no CPU over the last 7 days, so about $0.27 of usage a month.
- Postgres is estimated, not measured, at 150 to 350 MB of RAM and under 1 GB of disk: about $1.70 to $4.10 a month.
- Together that is under the $5 Hobby allowance, so the bill stays at $5 until usage passes it. Real numbers come from Railway's metrics once the database runs. Player traffic is what grows.
- Move to Pro when usage regularly passes the included $5, or when a need that Hobby lacks appears. One example: SMTP is disabled on Hobby, so email must go through a service with an HTTPS API until then.
- Turn on volume backups for the database from day one. The schedules are daily (kept 6 days), weekly (kept 27 days) and monthly (kept 89 days). Automatic failover needs the separate high-availability setup and is not planned.

## What the owner has to do

None of these involve pasting a secret into a chat or a file.
1. In the Discord Developer Portal, create an application. Add the redirect URIs `https://<the game's public address>/auth/discord/callback` and a local one for development. The public address is needed first.
2. In the Railway project `look-over-there`, add a PostgreSQL service and approve its cost. Turn on a backup schedule.
3. In the `game` service variables, set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET` (random, 32 bytes or more) and reference `DATABASE_URL` from the database service.

## Build steps for session 5

Needs session 3 merged for steps 4 and 5.

1. Store interface, in-memory implementation, Postgres implementation, migration runner and tests. Done when the existing 46 server tests still pass unchanged against the in-memory store.
2. Anonymous sessions: the cookie, the WebSocket join, and `original_complete` stored in the account. Done when a reload keeps the flag and a cookie-less join is refused or made anonymous.
3. Discord sign-in: the start and callback routes, the `state` and `iss` checks, linking and merging. Tested against a fake Discord server, never the real one.
4. Run records and leaderboards: build the record at the end of a round (RND-21), `GET /leaderboard?mode=&players=&by=` with paging and "my rank". Done when a made-up time from a client is refused (RND-26).
5. Privacy: delete my account, the 18+ confirmation, and the privacy and terms pages as stubs for the owner to finish.

## Not verified

- Railway's Postgres memory use for this workload. The cost figure is an estimate.
- The exact Discord OAuth2 parameters beyond what is quoted above, including PKCE.
- That the game server's public address and any custom domain are settled.
