## ADDED Requirements

### Requirement: Leaderboard row carries badges_csv and subject_mastery_count

The `leaderboard` D1 table SHALL gain two new columns via migration `cloudflare/sync-worker/migrations/0002_add_badges.sql`:

- `badges_csv TEXT DEFAULT ''` — format: comma-separated `category:tier` pairs (max 6 entries, max 60 chars total). Example: `"study:P1,quiz:P2,recruit:P2,hospital:P3,fortune:P4,hidden:P1"`. Each pair represents the highest tier the player has unlocked in that category.
- `subject_mastery_count INTEGER DEFAULT 0` — integer in range [0, 14] representing how many of the 14 subject mastery achievements the player has unlocked.

The migration SHALL be applied manually via `wrangler d1 migrations apply study-rpg-leaderboard --remote` by the owner (sustaining the manual-apply discipline established by migration 0001).

#### Scenario: Migration adds columns with safe defaults

- **WHEN** the owner applies migration 0002_add_badges.sql to a D1 database that contains existing leaderboard rows
- **THEN** every existing row SHALL receive `badges_csv = ''` and `subject_mastery_count = 0` automatically (no row-level update needed)

#### Scenario: Old Worker reads new columns gracefully

- **WHEN** an unpatched Worker (from before the deploy of new endpoints) queries the leaderboard table after migration apply
- **THEN** the query SHALL succeed (columns are nullable with defaults); the Worker's SELECT statement does not need to be updated

### Requirement: Worker upsert endpoint accepts badges_csv and subject_mastery_count

The Worker endpoint `POST /leaderboard/upsert` SHALL extend its accepted JWT-authenticated request body to include two optional fields: `badges_csv: string` and `subject_mastery_count: number`. Validation:

- `badges_csv` MUST match regex `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (1–6 entries, lowercase category, P1-P4 tier) OR be empty string
- `subject_mastery_count` MUST be an integer in [0, 14]

Invalid values SHALL be rejected with `400 Bad Request`. Valid values SHALL be written to the D1 row via UPSERT with LWW on `updated_at`.

#### Scenario: Valid badges_csv accepted

- **WHEN** a client POSTs `{ "badges_csv": "study:P2,quiz:P1", "subject_mastery_count": 5, ... }` with a valid JWT
- **THEN** the Worker SHALL upsert the row with these values and return 200

#### Scenario: Out-of-range subject_mastery_count rejected

- **WHEN** a client POSTs `{ "subject_mastery_count": 99, ... }`
- **THEN** the Worker SHALL return 400 with an error message indicating the field is out of range

#### Scenario: Malformed badges_csv rejected

- **WHEN** a client POSTs `{ "badges_csv": "study:PURPLE,invalid-format" }`
- **THEN** the Worker SHALL return 400

### Requirement: KV snapshot includes badges_csv and subject_mastery_count

The hourly leaderboard cron handler SHALL include both new fields when writing the Top 100 snapshots to KV (keys `leaderboard:m2:top100:<filter>`). Public read endpoints (`GET /leaderboard/:filter`) SHALL return these fields in the response JSON.

#### Scenario: KV snapshot row carries badges

- **WHEN** the hourly cron runs and a player is in the Top 100
- **THEN** that player's entry in the KV snapshot SHALL include `badges_csv` and `subject_mastery_count` fields (alongside existing fields like nickname, hospital_tier, etc.)

#### Scenario: Read endpoint exposes badges to client

- **WHEN** any client makes `GET /leaderboard/composite`
- **THEN** the response JSON SHALL include `badges_csv` and `subject_mastery_count` for each row

### Requirement: LeaderboardPage renders 6 category badges + subject mastery chip

The 二階 `LeaderboardPage.tsx` SHALL render each leaderboard row's nickname column with two additional visual elements (placed after nickname, before stat columns):

1. **6 category badges** inline (fixed display order: study / quiz / recruit / hospital / fortune / hidden). For each category present in the player's `badges_csv`, render a `<BadgeSprite category={cat} tier={tier} size={24} />` (mobile) or `size={32}` (desktop). Missing categories render nothing for that slot (no placeholder).
2. **Subject mastery chip** in the form `🩺 X/14` immediately after the 6 category badges. Render only when `subject_mastery_count > 0`; otherwise omit.

Hovering / long-pressing a category badge SHALL show a tooltip with text `<TIER> 級<CATEGORY>成就`. Hovering the subject chip SHALL NOT show a tooltip in MVP (the full 14-subject grid lives in personal `/achievements` page).

#### Scenario: Full badge profile renders

- **WHEN** a leaderboard row has `badges_csv = "study:P1,quiz:P2,recruit:P2,hospital:P3,fortune:P4,hidden:P1"` and `subject_mastery_count = 5`
- **THEN** the row displays 6 inline BadgeSprite components plus a chip `🩺 5/14`

#### Scenario: Partial badge profile renders

- **WHEN** a row has `badges_csv = "study:P3,quiz:P4"` and `subject_mastery_count = 0`
- **THEN** the row displays 2 BadgeSprite components (study P3, quiz P4) and no chip

#### Scenario: Row width does not break on max badges

- **WHEN** a row has all 6 categories present and `subject_mastery_count = 14`
- **THEN** the total badge + chip width on mobile (24px × 6 + chip ≈ 200px) MUST fit within the row without wrapping or horizontal overflow

### Requirement: Client push includes derived badges_csv and subject_mastery_count

The 二階 sync engine's `onPushComplete` callback in `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` SHALL derive `badges_csv` and `subject_mastery_count` from the local `achievements` Dexie table and include them in the upsert payload to the Worker. Derivation:

- `badges_csv`: for each of 6 main categories, find the highest tier among unlocked achievements (tier order: P4 < P3 < P2 < P1). Skip categories with zero unlocks. Format as `cat:tier` and join with commas.
- `subject_mastery_count`: count of unlocked achievements whose `id` matches pattern `subject-master-*` (NOT counting the `all-subjects-mastered` capstone).

#### Scenario: Empty achievements yields empty badges

- **WHEN** the player has not unlocked any achievements
- **THEN** the client SHALL push `{ "badges_csv": "", "subject_mastery_count": 0 }`

#### Scenario: One unlock per category produces expected CSV

- **WHEN** the player has unlocked one P3 study achievement and one P4 hospital achievement
- **THEN** the client SHALL push `{ "badges_csv": "study:P3,hospital:P4", "subject_mastery_count": 0 }`

#### Scenario: 5 subject masteries push count=5

- **WHEN** the player has unlocked `subject-master-內科` / `subject-master-外科` / `subject-master-小兒科` / `subject-master-皮膚科` / `subject-master-神經內科`
- **THEN** the client SHALL push `subject_mastery_count: 5`
