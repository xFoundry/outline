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
import "./bootstrap";
import { UserRole } from "@shared/types";
import teamCreator from "@server/commands/teamCreator";
import { createContext } from "@server/context";
import env from "@server/env";
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

  if (!env.hasWorkspaceSubdomains) {
    console.error(
      "Error: Workspace subdomain routing is not enabled.\n" +
        "Set HOSTED_WORKSPACE_ROUTING=true in your environment to enable multi-tenant support.\n" +
        "Without workspace routing, additional teams will not be accessible."
    );
    process.exit(1);
  }

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
