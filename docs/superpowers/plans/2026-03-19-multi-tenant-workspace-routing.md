# Multi-Tenant Workspace Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable multiple browser-accessible workspaces on a single self-hosted Outline instance by introducing a `hasWorkspaceSubdomains` capability flag that unlocks subdomain-based team routing, shared session cookies, team-scoped auth, and workspace switching UI.

**Architecture:** Introduce a new `HOSTED_WORKSPACE_ROUTING` env var (boolean). Add a computed property `hasWorkspaceSubdomains` to `Environment` that returns `true` when either `isCloudHosted` or `HOSTED_WORKSPACE_ROUTING` is set. Replace `isCloudHosted` with `hasWorkspaceSubdomains` at ~23 routing/auth/cookie callsites. Leave all ~32 SaaS-only callsites (robots.txt, email noreply, desktop app, plugin filters, etc.) untouched. Add a CLI provisioning script for creating student teams.

**Tech Stack:** TypeScript, Koa, Sequelize, React, MobX, PostgreSQL, Railway (wildcard DNS + SSL)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `server/scripts/provisionTeam.ts` | CLI script to create teams with admin users programmatically |

### Modified Files
| File | Change Summary |
|------|---------------|
| `server/env.ts` | Add `HOSTED_WORKSPACE_ROUTING` env var + `hasWorkspaceSubdomains` getter |
| `server/policies/utils.ts` | Add `hasWorkspaceSubdomains()` policy helper |
| `server/policies/team.ts` | Switch `createTeam`/`delete`/`audit` to `hasWorkspaceSubdomains` |
| `server/utils/passport.ts` | Switch team resolution + cookie domain to `hasWorkspaceSubdomains` |
| `server/utils/authentication.ts` | Switch session cookie + subdomain redirect to `hasWorkspaceSubdomains` |
| `server/models/Team.ts` | Switch `url` getter to `hasWorkspaceSubdomains` |
| `server/commands/teamUpdater.ts` | Allow subdomain updates when `hasWorkspaceSubdomains` |
| `server/commands/teamProvisioner.ts` | Use `hasWorkspaceSubdomains` for provider isolation |
| `server/models/helpers/AuthenticationHelper.ts` | Use `hasWorkspaceSubdomains` for provider scoping |
| `server/routes/api/auth/auth.ts` | Switch `auth.config` to subdomain routing |
| `server/routes/index.ts` | Switch catch-all redirect logic + OAuth metadata origin |
| `server/middlewares/passport.ts` | Switch OAuth error redirect to use requesting host |
| `server/middlewares/csrf.ts` | Switch CSRF cookie domain |
| `plugins/email/server/auth/email.ts` | Switch email auth team lookup |
| `server/services/websockets.ts` | Switch WebSocket CORS + origin validation |
| `app/utils/isCloudHosted.ts` | Add `isWorkspaceRouting` export |
| `app/stores/AuthStore.ts` | Switch subdomain redirect + logout cookie |
| `app/scenes/Settings/Details.tsx` | Show subdomain setting |
| `app/scenes/Settings/Security.tsx` | Show invite required + workspace creation toggles |
| `app/scenes/Login/Login.tsx` | Fix first-run detection for multi-tenant |
| `app/scenes/Login/OAuthAuthorize.tsx` | Enable team switcher |
| `app/scenes/Login/components/BackButton.tsx` | Show back button |

---

## Task 1: Add `hasWorkspaceSubdomains` env var and getter (Backend)

**Files:**
- Modify: `server/env.ts:807-819`

- [ ] **Step 1: Write the failing test**

Create a test that verifies `hasWorkspaceSubdomains` returns true when `HOSTED_WORKSPACE_ROUTING` is set.

```typescript
// In a temporary test or inline verification — Outline doesn't unit-test env.ts directly.
// We'll verify this in integration during Task 3.
```

Skip — env.ts is validated at startup; we'll verify via Task 3 tests.

- [ ] **Step 2: Add the env var and computed property**

In `server/env.ts`, after the `POPULARITY_UPDATE_INTERVAL_HOURS` block (line ~807) and before the `isCloudHosted` getter (line ~813), add:

```typescript
  /**
   * When true, enables workspace subdomain routing on self-hosted installations.
   * This allows multiple teams to coexist on a single instance, each accessible
   * via their own subdomain (e.g., team1.example.com, team2.example.com).
   */
  @Public
  @IsOptional()
  @IsBoolean()
  public HOSTED_WORKSPACE_ROUTING =
    this.toOptionalBoolean(environment.HOSTED_WORKSPACE_ROUTING) ?? false;
```

Then after the `isCloudHosted` getter (line ~819), add:

```typescript
  /**
   * Returns true if workspace subdomain routing is enabled, either because this
   * is the cloud hosted version or because HOSTED_WORKSPACE_ROUTING is set.
   */
  public get hasWorkspaceSubdomains() {
    return this.isCloudHosted || this.HOSTED_WORKSPACE_ROUTING;
  }
```

- [ ] **Step 3: Verify server starts with new env var**

Run: `cd /Users/alexo/WebstormProjects/outline/outline && HOSTED_WORKSPACE_ROUTING=true yarn dev`
Expected: Server starts without validation errors.

- [ ] **Step 4: Commit**

```bash
git add server/env.ts
git commit -m "$(cat <<'EOF'
feat: add HOSTED_WORKSPACE_ROUTING env var for multi-tenant self-hosted

Adds a new boolean env var and computed getter `hasWorkspaceSubdomains`
that will be used to selectively enable subdomain-based team routing
on self-hosted installations without enabling all cloud-only features.
EOF
)"
```

---

## Task 2: Add `hasWorkspaceSubdomains` policy helper

**Files:**
- Modify: `server/policies/utils.ts:104-112`

- [ ] **Step 1: Add the helper function**

In `server/policies/utils.ts`, after the existing `isCloudHosted()` function (line ~112), add:

```typescript
/**
 * Check if this instance has workspace subdomain routing enabled.
 */
export function hasWorkspaceSubdomains() {
  if (!env.hasWorkspaceSubdomains) {
    return false;
  }
  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/policies/utils.ts
git commit -m "feat: add hasWorkspaceSubdomains policy helper"
```

---

## Task 3: Switch team policies to use `hasWorkspaceSubdomains`

**Files:**
- Modify: `server/policies/team.ts:1-50`
- Test: `server/policies/team.test.ts` (if it exists, otherwise inline verification)

- [ ] **Step 1: Check if existing tests exist**

Run: `ls server/policies/team.test.ts 2>/dev/null || echo "no existing test"`

- [ ] **Step 2: Update policy imports and rules**

In `server/policies/team.ts`, add `hasWorkspaceSubdomains` to the import:

```typescript
import {
  and,
  hasWorkspaceSubdomains,
  isCloudHosted,
  isTeamAdmin,
  isTeamModel,
  isTeamMutable,
  or,
} from "./utils";
```

Replace `isCloudHosted()` with `hasWorkspaceSubdomains()` in the `createTeam` and `delete`/`audit` rules:

Line 35: `isCloudHosted()` → `hasWorkspaceSubdomains()`
Line 47: `isCloudHosted()` → `hasWorkspaceSubdomains()`

The result:

```typescript
allow(User, "createTeam", Team, (actor, team) =>
  and(
    //
    hasWorkspaceSubdomains(),
    !actor.isGuest,
    !actor.isViewer,
    or(actor.isAdmin, !!team?.memberTeamCreate)
  )
);

// ...

allow(User, ["delete", "audit"], Team, (actor, team) =>
  and(
    //
    hasWorkspaceSubdomains(),
    isTeamAdmin(actor, team)
  )
);
```

- [ ] **Step 3: Verify policies compile**

Run: `yarn tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add server/policies/team.ts
git commit -m "feat: gate team create/delete on hasWorkspaceSubdomains instead of isCloudHosted"
```

---

## Task 4: Switch team resolution (`getTeamFromContext`)

**Files:**
- Modify: `server/utils/passport.ts:241-255`

This is the most critical change — it determines which team a request belongs to.

- [ ] **Step 1: Update `getTeamFromContext`**

Replace the team resolution block (lines 240-255):

```typescript
  let team;
  if (!env.hasWorkspaceSubdomains) {
    if (env.ENVIRONMENT === "test") {
      team = await Team.findOne({ where: { domain: env.URL } });
    } else {
      team = await Team.findOne({
        order: [["createdAt", "DESC"]],
      });
    }
  } else if (ctx.state?.rootShare) {
    team = await Team.findByPk(ctx.state.rootShare.teamId);
  } else if (domain.custom) {
    team = await Team.findOne({ where: { domain: domain.host } });
  } else if (domain.teamSubdomain) {
    team = await Team.findBySubdomain(domain.teamSubdomain);
  }
```

- [ ] **Step 2: Update cookie domain calls in StateStore**

Line 60: `getCookieDomain(ctx.hostname, env.isCloudHosted)` → `getCookieDomain(ctx.hostname, env.hasWorkspaceSubdomains)`

Line 86: `getCookieDomain(ctx.hostname, env.isCloudHosted)` → `getCookieDomain(ctx.hostname, env.hasWorkspaceSubdomains)`

- [ ] **Step 3: Verify compilation**

Run: `yarn tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add server/utils/passport.ts
git commit -m "feat: use hasWorkspaceSubdomains for team resolution and OAuth state cookies"
```

---

## Task 5: Switch authentication flow (signIn + sessions cookie)

**Files:**
- Modify: `server/utils/authentication.ts:90-177`

- [ ] **Step 1: Update cookie domain**

Line 90: `getCookieDomain(ctx.request.hostname, env.isCloudHosted)` → `getCookieDomain(ctx.request.hostname, env.hasWorkspaceSubdomains)`

- [ ] **Step 2: Update subdomain redirect condition**

Line 104: `if (env.isCloudHosted && team.subdomain)` → `if (env.hasWorkspaceSubdomains && team.subdomain)`

- [ ] **Step 3: Verify compilation**

Run: `yarn tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add server/utils/authentication.ts
git commit -m "feat: use hasWorkspaceSubdomains for session cookies and subdomain redirect"
```

---

## Task 6: Switch Team.url getter and teamUpdater

**Files:**
- Modify: `server/models/Team.ts:237`
- Modify: `server/commands/teamUpdater.ts:19`

- [ ] **Step 1: Update subdomain length validation**

In `server/models/Team.ts`, lines 100-106 — the subdomain max length decorator also references `isCloudHosted`. Update both occurrences:

`env.isCloudHosted` → `env.hasWorkspaceSubdomains` (appears twice in the `@Length` decorator, lines 100 and 104)

```typescript
  @Length({
    min: TeamValidation.minSubdomainLength,
    max: env.hasWorkspaceSubdomains
      ? TeamValidation.maxSubdomainLength
      : TeamValidation.maxSubdomainSelfHostedLength,
    msg: `subdomain must be between ${TeamValidation.minSubdomainLength} and ${
      env.hasWorkspaceSubdomains
        ? TeamValidation.maxSubdomainLength
        : TeamValidation.maxSubdomainSelfHostedLength
    } characters`,
  })
```

- [ ] **Step 2: Update Team.url getter**

In `server/models/Team.ts`, line 237:

`if (!this.subdomain || !env.isCloudHosted)` → `if (!this.subdomain || !env.hasWorkspaceSubdomains)`

- [ ] **Step 3: Update teamUpdater subdomain gate**

In `server/commands/teamUpdater.ts`, line 19:

`if (subdomain !== undefined && env.isCloudHosted)` → `if (subdomain !== undefined && env.hasWorkspaceSubdomains)`

- [ ] **Step 4: Verify compilation**

Run: `yarn tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add server/models/Team.ts server/commands/teamUpdater.ts
git commit -m "feat: use hasWorkspaceSubdomains for Team URL generation and subdomain updates"
```

---

## Task 7: Switch auth.config endpoint

**Files:**
- Modify: `server/routes/api/auth/auth.ts:27-115`

- [ ] **Step 1: Update self-hosted early return**

Line 31: `if (!env.isCloudHosted)` → `if (!env.hasWorkspaceSubdomains)`

- [ ] **Step 2: Update subdomain branch**

Line 82: `else if (env.isCloudHosted && domain.teamSubdomain)` → `else if (env.hasWorkspaceSubdomains && domain.teamSubdomain)`

- [ ] **Step 3: Verify compilation**

Run: `yarn tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add server/routes/api/auth/auth.ts
git commit -m "feat: use hasWorkspaceSubdomains for auth.config team resolution"
```

---

## Task 8: Switch OAuth error redirect middleware

**Files:**
- Modify: `server/middlewares/passport.ts:48-51`

- [ ] **Step 1: Update redirect logic**

Lines 48-51, change:

```typescript
            const url = new URL(
              env.isCloudHosted
                ? `${reqProtocol}://${requestHost}${redirectPath}`
                : `${env.URL}${redirectPath}`
            );
```

to:

```typescript
            const url = new URL(
              env.hasWorkspaceSubdomains
                ? `${reqProtocol}://${requestHost}${redirectPath}`
                : `${env.URL}${redirectPath}`
            );
```

- [ ] **Step 2: Commit**

```bash
git add server/middlewares/passport.ts
git commit -m "feat: use hasWorkspaceSubdomains for OAuth error redirect"
```

---

## Task 9: Switch CSRF cookie domain

**Files:**
- Modify: `server/middlewares/csrf.ts:30`

- [ ] **Step 1: Update cookie domain**

Line 30: `getCookieDomain(ctx.request.hostname, env.isCloudHosted)` → `getCookieDomain(ctx.request.hostname, env.hasWorkspaceSubdomains)`

- [ ] **Step 2: Commit**

```bash
git add server/middlewares/csrf.ts
git commit -m "feat: use hasWorkspaceSubdomains for CSRF cookie domain"
```

---

## Task 10: Switch email auth team lookup

**Files:**
- Modify: `plugins/email/server/auth/email.ts:33`

- [ ] **Step 1: Update team lookup**

Line 33: `if (!env.isCloudHosted)` → `if (!env.hasWorkspaceSubdomains)`

- [ ] **Step 2: Commit**

```bash
git add plugins/email/server/auth/email.ts
git commit -m "feat: use hasWorkspaceSubdomains for email auth team lookup"
```

---

## Task 11: Switch WebSocket CORS and origin validation

**Files:**
- Modify: `server/services/websockets.ts:45,70`

- [ ] **Step 1: Update CORS origin**

Line 45: `origin: env.isCloudHosted ? "*" : env.URL` → `origin: env.hasWorkspaceSubdomains ? "*" : env.URL`

- [ ] **Step 2: Update origin validation**

Lines 69-71:

```typescript
        if (
          !env.hasWorkspaceSubdomains &&
          (!req.headers.origin || !env.URL.startsWith(req.headers.origin))
        ) {
```

- [ ] **Step 3: Commit**

```bash
git add server/services/websockets.ts
git commit -m "feat: use hasWorkspaceSubdomains for WebSocket CORS and origin validation"
```

---

## Task 12: Switch teamProvisioner provider isolation

**Files:**
- Modify: `server/commands/teamProvisioner.ts:80`

- [ ] **Step 1: Update cloud-hosted guard**

Line 80: `if (env.isCloudHosted)` → `if (env.hasWorkspaceSubdomains)`

This ensures that in multi-tenant mode, an unfamiliar SSO provider does NOT get auto-attached to an existing team (which would break tenant isolation).

- [ ] **Step 2: Commit**

```bash
git add server/commands/teamProvisioner.ts
git commit -m "feat: use hasWorkspaceSubdomains for auth provider isolation in teamProvisioner"
```

---

## Task 13: Switch AuthenticationHelper provider scoping

**Files:**
- Modify: `server/models/helpers/AuthenticationHelper.ts:28,78-79`

- [ ] **Step 1: Update provider scoping**

Line 28: `const isCloudHosted = env.isCloudHosted;` → `const isWorkspaceRouting = env.hasWorkspaceSubdomains;`

Lines 77-79:

```typescript
        return (
          (!isWorkspaceRouting && authProvider?.enabled !== false) ||
          (isWorkspaceRouting && authProvider?.enabled)
        );
```

This ensures each team only sees auth providers that were explicitly enabled for it.

- [ ] **Step 2: Commit**

```bash
git add server/models/helpers/AuthenticationHelper.ts
git commit -m "feat: scope auth providers per-team when workspace routing is enabled"
```

---

## Task 14: Switch catch-all route redirect logic

**Files:**
- Modify: `server/routes/index.ts:231`

- [ ] **Step 1: Update cloud-hosted redirect block**

Line 231: `if (env.isCloudHosted)` → `if (env.hasWorkspaceSubdomains)`

- [ ] **Step 2: Update OAuth metadata origin (lines 122, 162)**

Line 122: `const origin = env.isCloudHosted` → `const origin = env.hasWorkspaceSubdomains`
Line 162: `const origin = env.isCloudHosted` → `const origin = env.hasWorkspaceSubdomains`

- [ ] **Step 3: Verify compilation**

Run: `yarn tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add server/routes/index.ts
git commit -m "feat: use hasWorkspaceSubdomains for catch-all redirect and OAuth metadata"
```

---

## Task 15: Add frontend `isWorkspaceRouting` flag

**Files:**
- Modify: `app/utils/isCloudHosted.ts`

- [ ] **Step 1: Add isWorkspaceRouting export**

Add to `app/utils/isCloudHosted.ts`:

```typescript
import env from "~/env";

/**
 * True if the current installation is the cloud hosted version at getoutline.com
 */
const isCloudHosted = [
  "https://app.getoutline.com",
  "https://app.outline.dev",
  "https://app.outline.dev:3000",
].includes(env.URL);

export default isCloudHosted;

/**
 * True if workspace subdomain routing is enabled (cloud hosted or self-hosted
 * with HOSTED_WORKSPACE_ROUTING=true).
 */
export const isWorkspaceRouting =
  isCloudHosted || env.HOSTED_WORKSPACE_ROUTING === true;
```

Note: `HOSTED_WORKSPACE_ROUTING` is decorated with `@Public` so it's available on `window.env`.

- [ ] **Step 2: Commit**

```bash
git add app/utils/isCloudHosted.ts
git commit -m "feat: add isWorkspaceRouting flag for frontend workspace routing checks"
```

---

## Task 16: Switch frontend AuthStore

**Files:**
- Modify: `app/stores/AuthStore.ts`

- [ ] **Step 1: Update imports**

Add `isWorkspaceRouting` import. Find the existing `isCloudHosted` import (search for it) and add alongside:

```typescript
import isCloudHosted, { isWorkspaceRouting } from "~/utils/isCloudHosted";
```

- [ ] **Step 2: Update subdomain redirect check**

Around line 237: `isCloudHosted &&` → `isWorkspaceRouting &&`

```typescript
        } else if (
          isWorkspaceRouting &&
          parseDomain(hostname).teamSubdomain !== (data.team.subdomain ?? "")
        ) {
```

- [ ] **Step 3: Update logout cookie domain**

Around line 350: `getCookieDomain(window.location.hostname, isCloudHosted)` → `getCookieDomain(window.location.hostname, isWorkspaceRouting)`

- [ ] **Step 4: Commit**

```bash
git add app/stores/AuthStore.ts
git commit -m "feat: use isWorkspaceRouting for subdomain redirect and logout cookie"
```

---

## Task 17: Switch frontend Login and Settings scenes

**Files:**
- Modify: `app/scenes/Login/Login.tsx`
- Modify: `app/scenes/Login/OAuthAuthorize.tsx`
- Modify: `app/scenes/Login/components/BackButton.tsx`
- Modify: `app/scenes/Settings/Details.tsx`
- Modify: `app/scenes/Settings/Security.tsx`

- [ ] **Step 1: Update Login.tsx**

Add import: `import isCloudHosted, { isWorkspaceRouting } from "~/utils/isCloudHosted";`

Line 129: Keep `!isCloudHosted` (error detail is SaaS-specific — OK).
Line 151: Keep `isCloudHosted` (custom domain setup message is cloud-specific — OK).
Line 203: `!isCloudHosted` → `!isWorkspaceRouting` (first-run detection must account for multi-tenant self-hosted):

```typescript
  const firstRun =
    config.providers.length === 0 && !isWorkspaceRouting && !config.name;
```

- [ ] **Step 2: Update OAuthAuthorize.tsx**

Add import: `import isCloudHosted, { isWorkspaceRouting } from "~/utils/isCloudHosted";`

Line 49: `isCloudHosted` → `isWorkspaceRouting`:

```typescript
  if (isWorkspaceRouting && hasLoggedInSessions && isAppRoot) {
    return <TeamSwitcher sessions={sessions} />;
  }
```

- [ ] **Step 3: Update BackButton.tsx**

Add import: `import isCloudHosted, { isWorkspaceRouting } from "~/utils/isCloudHosted";`

Line 28: `!isCloudHosted` → `!isWorkspaceRouting`:

```typescript
  if (!isWorkspaceRouting || parseDomain(window.location.origin).custom) {
    return null;
  }
```

- [ ] **Step 4: Update Details.tsx (subdomain setting)**

Add import: `import { isWorkspaceRouting } from "~/utils/isCloudHosted";`

Line 394: `visible={isCloudHosted}` → `visible={isWorkspaceRouting}`

Lines 419-421: Replace the `isCloudHosted` ternary with `isWorkspaceRouting`:
```typescript
              maxLength={
                isWorkspaceRouting
                  ? TeamValidation.maxSubdomainLength
                  : TeamValidation.maxSubdomainSelfHostedLength
              }
```

Note: Keep the `isCloudHosted` reference at line 419 for the maxLength — actually both cloud and workspace-routing should use the cloud length since subdomains are meaningful. Change to `isWorkspaceRouting`.

- [ ] **Step 5: Update Security.tsx (workspace creation toggle)**

Add import: `import { isWorkspaceRouting } from "~/utils/isCloudHosted";`

Line 231: `{isCloudHosted && (` → `{isWorkspaceRouting && (`  (invite required toggle)
Line 351: `{isCloudHosted && (` → `{isWorkspaceRouting && (`  (workspace creation toggle)

- [ ] **Step 6: Verify frontend builds**

Run: `yarn build`
Expected: No compilation errors.

- [ ] **Step 7: Commit**

```bash
git add app/scenes/Login/Login.tsx app/scenes/Login/OAuthAuthorize.tsx \
       app/scenes/Login/components/BackButton.tsx \
       app/scenes/Settings/Details.tsx app/scenes/Settings/Security.tsx
git commit -m "feat: enable workspace routing UI components for multi-tenant self-hosted"
```

---

## Task 18: Create CLI provisioning script

**Files:**
- Create: `server/scripts/provisionTeam.ts`

- [ ] **Step 1: Write the provisioning script**

```typescript
/**
 * CLI script to provision a new team (workspace) on a self-hosted Outline
 * instance with HOSTED_WORKSPACE_ROUTING enabled.
 *
 * Usage:
 *   yarn ts-node server/scripts/provisionTeam.ts \
 *     --name "Team Alpha" \
 *     --subdomain "alpha" \
 *     --adminEmail "admin@example.com" \
 *     --adminName "Admin User" \
 *     --authProvider "google" \
 *     --providerId "example.com"
 *
 * Required: --name, --subdomain, --adminEmail, --adminName
 * Optional: --authProvider (default: "email"), --providerId
 */
import "../env";
import { UserRole } from "@shared/types";
import teamCreator from "@server/commands/teamCreator";
import { createContext } from "@server/context";
import { User } from "@server/models";
import { sequelize } from "@server/storage/database";

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    const value = args[i + 1];
    if (key && value) {
      result[key] = value;
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.name || !args.subdomain || !args.adminEmail || !args.adminName) {
    console.error(
      "Usage: --name <team> --subdomain <sub> --adminEmail <email> --adminName <name> [--authProvider <provider>] [--providerId <id>]"
    );
    process.exit(1);
  }

  const authProvider = args.authProvider || "email";
  const providerId = args.providerId || args.subdomain;

  await sequelize.transaction(async (transaction) => {
    const ctx = createContext({ transaction });

    const team = await teamCreator(ctx, {
      name: args.name,
      subdomain: args.subdomain,
      authenticationProviders: [
        {
          name: authProvider,
          providerId,
        },
      ],
    });

    const user = await User.createWithCtx(ctx, {
      teamId: team.id,
      name: args.adminName,
      email: args.adminEmail,
      role: UserRole.Admin,
    });

    console.log(`Team created:`);
    console.log(`  ID:        ${team.id}`);
    console.log(`  Name:      ${team.name}`);
    console.log(`  Subdomain: ${team.subdomain}`);
    console.log(`  URL:       ${team.url}`);
    console.log(`Admin user created:`);
    console.log(`  ID:        ${user.id}`);
    console.log(`  Email:     ${user.email}`);
  });

  await sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to provision team:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify script compiles**

Run: `yarn tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add server/scripts/provisionTeam.ts
git commit -m "feat: add CLI script for programmatic team provisioning"
```

---

## Task 19: Integration verification

- [ ] **Step 1: Run full type check**

Run: `yarn tsc --noEmit`
Expected: No type errors.

- [ ] **Step 2: Run linter**

Run: `yarn lint`
Expected: No lint errors in modified files.

- [ ] **Step 3: Run backend tests**

Run: `yarn test:server`
Expected: All tests pass.

- [ ] **Step 4: Run frontend tests**

Run: `yarn test:app`
Expected: All tests pass.

- [ ] **Step 5: Verify no unintended isCloudHosted references remain in routing paths**

Run a grep to confirm all routing-critical callsites were switched:

```bash
# These should now reference hasWorkspaceSubdomains:
grep -n "isCloudHosted" server/utils/passport.ts server/utils/authentication.ts \
  server/models/Team.ts server/commands/teamUpdater.ts server/commands/teamProvisioner.ts \
  server/models/helpers/AuthenticationHelper.ts server/routes/api/auth/auth.ts \
  server/routes/index.ts server/middlewares/passport.ts server/middlewares/csrf.ts \
  plugins/email/server/auth/email.ts server/services/websockets.ts \
  server/policies/team.ts
```

Expected: Zero matches for `isCloudHosted` in the above files. All should reference `hasWorkspaceSubdomains` instead.

- [ ] **Step 6: Verify SaaS-only callsites are untouched**

Spot-check that these files still use `isCloudHosted`:
- `server/utils/robots.ts`
- `server/middlewares/csp.ts`
- `server/emails/mailer.tsx`
- `app/utils/PluginManager.ts`

Expected: Still referencing `isCloudHosted` (NOT `hasWorkspaceSubdomains`).

- [ ] **Step 7: Commit verification**

```bash
git add -A
git status  # Should show no unexpected changes
```

---

## Appendix A: Railway Deployment Configuration

After implementing the code changes, configure Railway as follows:

1. **Environment variables:**
   ```
   URL=https://app.example.com
   HOSTED_WORKSPACE_ROUTING=true
   ```

2. **Custom domains in Railway (Pro plan required for >2):**
   - `example.com`
   - `*.example.com`

3. **DNS records (e.g., at Cloudflare):**
   - `example.com` → CNAME to Railway service domain
   - `*.example.com` → CNAME to Railway service domain
   - `_acme-challenge.example.com` → CNAME for SSL cert (must NOT be proxied if Cloudflare)

4. **Important:** `URL=https://app.example.com` means `getBaseDomain()` strips the `app` prefix, producing base domain `example.com`. Teams will be at `teamname.example.com`, NOT `teamname.app.example.com`.

## Appendix B: Callsite Inventory

### Switched to `hasWorkspaceSubdomains` (23 callsites)

| # | File:Line | Purpose |
|---|-----------|---------|
| 1 | `server/env.ts:new` | Computed property definition |
| 2 | `server/policies/utils.ts:new` | Policy helper |
| 3 | `server/policies/team.ts:35` | createTeam policy |
| 4 | `server/policies/team.ts:47` | delete/audit policy |
| 5 | `server/utils/passport.ts:241` | getTeamFromContext |
| 6 | `server/utils/passport.ts:60` | StateStore cookie set |
| 7 | `server/utils/passport.ts:86` | StateStore cookie clear |
| 8 | `server/utils/authentication.ts:90` | signIn cookie domain |
| 9 | `server/utils/authentication.ts:104` | sessions cookie + redirect |
| 10 | `server/models/Team.ts:100-106` | Subdomain length validation |
| 11 | `server/models/Team.ts:237` | Team.url getter |
| 12 | `server/commands/teamUpdater.ts:19` | subdomain update |
| 13 | `server/commands/teamProvisioner.ts:80` | provider isolation |
| 14 | `server/models/helpers/AuthenticationHelper.ts:28,78` | provider scoping |
| 15 | `server/routes/api/auth/auth.ts:31` | auth.config self-hosted |
| 16 | `server/routes/api/auth/auth.ts:82` | auth.config subdomain |
| 17 | `server/routes/index.ts:122,162` | OAuth metadata origin |
| 18 | `server/routes/index.ts:231` | catch-all redirect |
| 19 | `server/middlewares/passport.ts:49` | OAuth error redirect |
| 20 | `server/middlewares/csrf.ts:30` | CSRF cookie domain |
| 21 | `plugins/email/server/auth/email.ts:33` | email auth team lookup |
| 22 | `server/services/websockets.ts:45` | WebSocket CORS |
| 23 | `server/services/websockets.ts:70` | WebSocket origin check |
| 24 | `app/utils/isCloudHosted.ts:new` | Frontend flag |

### Left on `isCloudHosted` (32+ callsites — SaaS only)

robots.txt, CSP scripts, email attachments, email noreply randomization, desktop app links, plugin deployment filters, notification toggles, OAuth client publishing, error reporting, installation API, TeamDomain limits, API key listing, share domains middleware, error boundary reporting, file operation help text, import error display, download app action, OAuth metadata (partially), and more.
