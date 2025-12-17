import { z } from "zod";
import { User } from "@server/models";
import { authorize } from "@server/policies";

/**
 * Tool definitions for user operations
 */
export const userTools = {
  users_list: {
    description: "List users in the workspace.",
    inputSchema: z.object({
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(25)
        .describe("Number of users to return"),
      offset: z.number().min(0).default(0).describe("Pagination offset"),
      query: z.string().optional().describe("Search by name or email"),
    }),
    handler: async (
      params: { limit?: number; offset?: number; query?: string },
      user: User
    ) => {
      const { limit = 25, offset = 0, query } = params;

      authorize(user, "listUsers", user.team);

      let users: User[];

      if (query) {
        users = await User.findAll({
          where: {
            teamId: user.teamId,
          },
          order: [["name", "ASC"]],
          limit,
          offset,
        });
        // Filter by query (name/email contains)
        users = users.filter(
          (u) =>
            u.name?.toLowerCase().includes(query.toLowerCase()) ||
            u.email?.toLowerCase().includes(query.toLowerCase())
        );
      } else {
        users = await User.findAll({
          where: {
            teamId: user.teamId,
          },
          order: [["name", "ASC"]],
          limit,
          offset,
        });
      }

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
    description: "Get information about the currently authenticated user.",
    inputSchema: z.object({}),
    handler: async (_params: Record<string, never>, user: User) => ({
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
