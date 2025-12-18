import { z } from "zod";
import { Op, WhereOptions } from "sequelize";
import { User } from "@server/models";
import { authorize } from "@server/policies";
import { APIContext } from "@server/types";

/**
 * Tool definitions for user operations
 */
export const userTools = {
  users_list: {
    description:
      "List team members/users who have access to this knowledge base. Useful for finding who created a document or assigning ownership.",
    inputSchema: z.object({
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(25)
        .describe("How many users to return (1-100, default 25)"),
      offset: z
        .number()
        .min(0)
        .default(0)
        .describe("Skip this many users for pagination"),
      query: z
        .string()
        .optional()
        .describe(
          "Optional: Search/filter users by name or email. Example: 'john' or 'john@example.com'"
        ),
    }),
    handler: async (
      params: { limit?: number; offset?: number; query?: string },
      user: User,
      _ctx: APIContext
    ) => {
      const { limit = 25, offset = 0, query } = params;

      authorize(user, "listUsers", user.team);

      // Build where clause with optional search filter at database level
      const where: WhereOptions<User> = {
        teamId: user.teamId,
        ...(query && {
          [Op.or]: [
            { name: { [Op.iLike]: `%${query}%` } },
            { email: { [Op.iLike]: `%${query}%` } },
          ],
        }),
      };

      const users = await User.findAll({
        where,
        order: [["name", "ASC"]],
        limit,
        offset,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              users.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                avatarUrl: u.avatarUrl,
                lastActiveAt: u.lastActiveAt,
                createdAt: u.createdAt,
              })),
              null,
              2
            ),
          },
        ],
      };
    },
  },

  users_me: {
    description:
      "Get information about YOU - the currently authenticated user making this request. Shows your name, email, role, and permissions.",
    inputSchema: z.object({}),
    handler: async (
      _params: Record<string, never>,
      user: User,
      _ctx: APIContext
    ) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              avatarUrl: user.avatarUrl,
              language: user.language,
              lastActiveAt: user.lastActiveAt,
              createdAt: user.createdAt,
              teamId: user.teamId,
            },
            null,
            2
          ),
        },
      ],
    }),
  },
};
