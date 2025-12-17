import { z } from "zod";
import { Document, Collection, User, SearchQuery } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import SearchHelper from "@server/models/helpers/SearchHelper";
import { authorize } from "@server/policies";
import { Op, WhereOptions } from "sequelize";
import { StatusFilter } from "@shared/types";

/**
 * Tool definitions for document operations
 */
export const documentTools = {
  documents_list: {
    description:
      "List documents in the workspace. Can filter by collection, user, or other criteria.",
    inputSchema: z.object({
      collectionId: z
        .string()
        .uuid()
        .optional()
        .describe("Filter by collection ID"),
      userId: z.string().uuid().optional().describe("Filter by author user ID"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(25)
        .describe("Number of documents to return"),
      offset: z.number().min(0).default(0).describe("Pagination offset"),
      sort: z
        .enum(["updatedAt", "createdAt", "title", "index"])
        .default("updatedAt")
        .describe("Sort field"),
      direction: z
        .enum(["ASC", "DESC"])
        .default("DESC")
        .describe("Sort direction"),
    }),
    handler: async (
      params: {
        collectionId?: string;
        userId?: string;
        limit?: number;
        offset?: number;
        sort?: string;
        direction?: string;
      },
      user: User
    ) => {
      const {
        collectionId,
        userId,
        limit = 25,
        offset = 0,
        sort = "updatedAt",
        direction = "DESC",
      } = params;

      const where: WhereOptions<Document> = {
        teamId: user.teamId,
        archivedAt: { [Op.is]: null },
        publishedAt: { [Op.not]: null },
      };

      if (collectionId) {
        where.collectionId = collectionId;
      }

      if (userId) {
        where.createdById = userId;
      }

      const documents = await Document.findAll({
        where,
        order: [[sort, direction]],
        limit,
        offset,
        include: [
          {
            model: Collection,
            as: "collection",
            required: true,
          },
        ],
      });

      // Filter by access permissions
      const accessibleDocuments = [];
      for (const doc of documents) {
        try {
          authorize(user, "read", doc);
          accessibleDocuments.push(doc);
        } catch {
          // Skip documents user can't access
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              accessibleDocuments.map((doc) => ({
                id: doc.id,
                title: doc.title,
                emoji: doc.emoji,
                collectionId: doc.collectionId,
                collectionName: doc.collection?.name,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
                createdById: doc.createdById,
                url: doc.url,
              })),
              null,
              2
            ),
          },
        ],
      };
    },
  },

  documents_info: {
    description:
      "Get detailed information about a specific document including its content.",
    inputSchema: z.object({
      id: z.string().uuid().describe("The document ID"),
    }),
    handler: async (params: { id: string }, user: User) => {
      const document = await Document.findByPk(params.id, {
        include: [
          {
            model: Collection,
            as: "collection",
          },
        ],
      });

      if (!document) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Document not found" }),
            },
          ],
          isError: true,
        };
      }

      authorize(user, "read", document);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: document.id,
                title: document.title,
                emoji: document.emoji,
                text: document.text,
                collectionId: document.collectionId,
                collectionName: document.collection?.name,
                parentDocumentId: document.parentDocumentId,
                createdAt: document.createdAt,
                updatedAt: document.updatedAt,
                publishedAt: document.publishedAt,
                createdById: document.createdById,
                lastModifiedById: document.lastModifiedById,
                url: document.url,
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  documents_search: {
    description:
      "Search for documents by query. Returns matching documents with snippets.",
    inputSchema: z.object({
      query: z.string().min(1).describe("Search query"),
      collectionId: z
        .string()
        .uuid()
        .optional()
        .describe("Filter by collection ID"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(25)
        .describe("Number of results to return"),
      includeArchived: z
        .boolean()
        .default(false)
        .describe("Include archived documents"),
      includeDrafts: z
        .boolean()
        .default(false)
        .describe("Include draft documents"),
    }),
    handler: async (
      params: {
        query: string;
        collectionId?: string;
        limit?: number;
        includeArchived?: boolean;
        includeDrafts?: boolean;
      },
      user: User
    ) => {
      const {
        query,
        collectionId,
        limit = 25,
        includeArchived = false,
        includeDrafts = false,
      } = params;

      const statusFilter: StatusFilter[] = [StatusFilter.Published];
      if (includeDrafts) {
        statusFilter.push(StatusFilter.Draft);
      }
      if (includeArchived) {
        statusFilter.push(StatusFilter.Archived);
      }

      const { results } = await SearchHelper.searchForUser(user, {
        query,
        collectionId,
        limit,
        statusFilter,
      });

      // Save the search query for analytics
      await SearchQuery.create({
        userId: user.id,
        teamId: user.teamId,
        source: "mcp",
        query,
        results: results.length,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              results.map((result) => ({
                id: result.document.id,
                title: result.document.title,
                emoji: result.document.emoji,
                collectionId: result.document.collectionId,
                context: result.context,
                ranking: result.ranking,
                url: result.document.url,
              })),
              null,
              2
            ),
          },
        ],
      };
    },
  },

  documents_create: {
    description: "Create a new document in a collection.",
    inputSchema: z.object({
      title: z.string().min(1).describe("Document title"),
      text: z.string().optional().describe("Document content in Markdown"),
      collectionId: z
        .string()
        .uuid()
        .describe("Collection to create document in"),
      parentDocumentId: z
        .string()
        .uuid()
        .optional()
        .describe("Parent document ID for nested documents"),
      publish: z
        .boolean()
        .default(true)
        .describe("Whether to publish the document immediately"),
    }),
    handler: async (
      params: {
        title: string;
        text?: string;
        collectionId: string;
        parentDocumentId?: string;
        publish?: boolean;
      },
      user: User
    ) => {
      const {
        title,
        text = "",
        collectionId,
        parentDocumentId,
        publish = true,
      } = params;

      const collection = await Collection.findByPk(collectionId);
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

      authorize(user, "createDocument", collection);

      // Validate parent document if provided
      if (parentDocumentId) {
        const parentDocument = await Document.findByPk(parentDocumentId);
        if (!parentDocument) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Parent document not found" }),
              },
            ],
            isError: true,
          };
        }
        if (parentDocument.collectionId !== collectionId) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Parent document must be in the same collection",
                }),
              },
            ],
            isError: true,
          };
        }
        authorize(user, "read", parentDocument);
      }

      const document = await Document.create({
        title,
        text,
        collectionId,
        parentDocumentId,
        teamId: user.teamId,
        createdById: user.id,
        lastModifiedById: user.id,
        publishedAt: publish ? new Date() : null,
      });

      if (publish) {
        await collection.addDocumentToStructure(document, 0);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: document.id,
                title: document.title,
                collectionId: document.collectionId,
                url: document.url,
                createdAt: document.createdAt,
                publishedAt: document.publishedAt,
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  documents_update: {
    description: "Update an existing document's title or content.",
    inputSchema: z.object({
      id: z.string().uuid().describe("Document ID to update"),
      title: z.string().optional().describe("New document title"),
      text: z.string().optional().describe("New document content in Markdown"),
      append: z
        .boolean()
        .default(false)
        .describe(
          "If true, append text to existing content instead of replacing"
        ),
    }),
    handler: async (
      params: {
        id: string;
        title?: string;
        text?: string;
        append?: boolean;
      },
      user: User
    ) => {
      const { id, title, text, append = false } = params;

      const document = await Document.findByPk(id);
      if (!document) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Document not found" }),
            },
          ],
          isError: true,
        };
      }

      authorize(user, "update", document);

      if (title !== undefined) {
        document.title = title;
      }

      if (text !== undefined) {
        DocumentHelper.applyMarkdownToDocument(
          document,
          append ? "\n\n" + text : text,
          append
        );
      }

      document.lastModifiedById = user.id;
      await document.save();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: document.id,
                title: document.title,
                updatedAt: document.updatedAt,
                url: document.url,
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
