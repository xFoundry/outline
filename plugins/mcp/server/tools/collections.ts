import { z } from "zod";
import { Collection, User } from "@server/models";
import { authorize } from "@server/policies";

/**
 * Tool definitions for collection operations
 */
export const collectionTools = {
  collections_list: {
    description:
      "List all collections in the workspace that the user can access.",
    inputSchema: z.object({
      includeArchived: z
        .boolean()
        .default(false)
        .describe("Include archived collections"),
    }),
    handler: async (params: { includeArchived?: boolean }, user: User) => {
      const { includeArchived = false } = params;

      const collections = await Collection.findAll({
        where: {
          teamId: user.teamId,
        },
        order: [["index", "ASC"]],
        paranoid: !includeArchived,
      });

      // Filter by access permissions
      const accessibleCollections = [];
      for (const collection of collections) {
        try {
          authorize(user, "read", collection);
          accessibleCollections.push(collection);
        } catch {
          // Skip collections user can't access
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              accessibleCollections.map((c) => ({
                id: c.id,
                name: c.name,
                description: c.description,
                icon: c.icon,
                color: c.color,
                permission: c.permission,
                documentCount: c.documentStructure?.length ?? 0,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
                url: c.url,
              })),
              null,
              2
            ),
          },
        ],
      };
    },
  },

  collections_info: {
    description:
      "Get detailed information about a specific collection including its document structure.",
    inputSchema: z.object({
      id: z.string().uuid().describe("The collection ID"),
    }),
    handler: async (params: { id: string }, user: User) => {
      const collection = await Collection.findByPk(params.id);

      if (!collection) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Collection not found" }),
            },
          ],
          isError: true,
        };
      }

      authorize(user, "read", collection);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: collection.id,
                name: collection.name,
                description: collection.description,
                icon: collection.icon,
                color: collection.color,
                permission: collection.permission,
                sharing: collection.sharing,
                sort: collection.sort,
                documentStructure: collection.documentStructure,
                createdAt: collection.createdAt,
                updatedAt: collection.updatedAt,
                url: collection.url,
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  collections_documents: {
    description:
      "Get the hierarchical document structure of a collection, showing all documents and their nesting.",
    inputSchema: z.object({
      id: z.string().uuid().describe("The collection ID"),
    }),
    handler: async (params: { id: string }, user: User) => {
      const collection = await Collection.findByPk(params.id);

      if (!collection) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Collection not found" }),
            },
          ],
          isError: true,
        };
      }

      authorize(user, "read", collection);

      // Helper to flatten the document structure with paths
      const flattenStructure = (
        nodes: typeof collection.documentStructure,
        path: string[] = []
      ): Array<{ id: string; title: string; path: string[]; url: string }> => {
        if (!nodes) {return [];}

        const result: Array<{
          id: string;
          title: string;
          path: string[];
          url: string;
        }> = [];
        for (const node of nodes) {
          const currentPath = [...path, node.title];
          result.push({
            id: node.id,
            title: node.title,
            path: currentPath,
            url: node.url,
          });
          if (node.children && node.children.length > 0) {
            result.push(...flattenStructure(node.children, currentPath));
          }
        }
        return result;
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                collectionId: collection.id,
                collectionName: collection.name,
                documents: flattenStructure(collection.documentStructure),
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },
};
