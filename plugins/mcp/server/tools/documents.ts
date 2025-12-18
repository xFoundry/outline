import { z } from "zod";
import { Document, Collection, User, SearchQuery } from "@server/models";
import SearchHelper from "@server/models/helpers/SearchHelper";
import { authorize } from "@server/policies";
import { Op, WhereOptions } from "sequelize";
import { StatusFilter } from "@shared/types";
import { APIContext } from "@server/types";
import documentCreator from "@server/commands/documentCreator";
import documentUpdater from "@server/commands/documentUpdater";

/**
 * Tool definitions for document operations
 */
export const documentTools = {
  documents_list: {
    description:
      "List and browse documents in the knowledge base. Use this to discover what documents exist, find documents in a specific collection, or see recently updated content. Returns document titles, IDs, and metadata but NOT full content - use documents_info to get content.",
    inputSchema: z.object({
      collectionId: z
        .string()
        .optional()
        .describe(
          "Optional: Filter to only show documents from a specific collection. Get collection IDs from collections_list."
        ),
      userId: z
        .string()
        .optional()
        .describe(
          "Optional: Filter to only show documents created by a specific user."
        ),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(25)
        .describe("How many documents to return (1-100, default 25)"),
      offset: z
        .number()
        .min(0)
        .default(0)
        .describe("Skip this many documents for pagination (default 0)"),
      sort: z
        .enum(["updatedAt", "createdAt", "title", "index"])
        .default("updatedAt")
        .describe("Sort by: updatedAt (default), createdAt, title, or index"),
      direction: z
        .enum(["ASC", "DESC"])
        .default("DESC")
        .describe(
          "Sort direction: DESC (newest first, default) or ASC (oldest first)"
        ),
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
      user: User,
      _ctx: APIContext
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
                icon: doc.icon,
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
      "Get the FULL CONTENT and details of a specific document. Use this when you need to read what a document actually says. Requires a document ID (UUID like '550e8400-e29b-41d4-a716-446655440000') or URL slug (like 'my-document-title-2r47tupaTA') - get these from documents_list or documents_search results.",
    inputSchema: z.object({
      id: z
        .string()
        .describe(
          "The document ID (UUID) or URL slug from search/list results. Example: '550e8400-e29b-41d4-a716-446655440000' or 'resource-matrix-2r47tupaTA'"
        ),
    }),
    handler: async (params: { id: string }, user: User, _ctx: APIContext) => {
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
                icon: document.icon,
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
      "Search for documents by keywords or phrases. This is the BEST way to find documents about a specific topic. Returns matching documents with context snippets showing where matches were found. Use the returned document IDs with documents_info to get full content.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          "Search terms to find in documents. Can be keywords, phrases, or questions. Example: 'onboarding process' or 'how to request time off'"
        ),
      collectionId: z
        .string()
        .optional()
        .describe(
          "Optional: Limit search to a specific collection. Get collection IDs from collections_list."
        ),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(25)
        .describe("Maximum number of results to return (1-100, default 25)"),
      includeArchived: z
        .boolean()
        .default(false)
        .describe("Set to true to also search archived/deleted documents"),
      includeDrafts: z
        .boolean()
        .default(false)
        .describe("Set to true to also search unpublished draft documents"),
    }),
    handler: async (
      params: {
        query: string;
        collectionId?: string;
        limit?: number;
        includeArchived?: boolean;
        includeDrafts?: boolean;
      },
      user: User,
      _ctx: APIContext
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
      // Note: Using "api" as source since SearchQuery enum doesn't include "mcp"
      await SearchQuery.create({
        userId: user.id,
        teamId: user.teamId,
        source: "api",
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
                icon: result.document.icon,
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
    description:
      "Create a NEW document in the knowledge base. Requires specifying which collection to put it in. Use collections_list first to find available collections and their IDs.",
    inputSchema: z.object({
      title: z
        .string()
        .min(1)
        .describe(
          "Title for the new document. Example: 'Employee Onboarding Guide'"
        ),
      text: z
        .string()
        .optional()
        .describe(
          "Document content in Markdown format. Supports headings (#, ##), lists (-, *), links, code blocks, etc. Leave empty to create a blank document."
        ),
      collectionId: z
        .string()
        .describe(
          "REQUIRED: The collection ID (UUID) where this document should be created. Get this from collections_list."
        ),
      parentDocumentId: z
        .string()
        .optional()
        .describe(
          "Optional: Place this document as a child/nested page under another document. Provide the parent document's ID."
        ),
      publish: z
        .boolean()
        .default(true)
        .describe(
          "Whether to publish immediately (true, default) or save as draft (false)"
        ),
    }),
    handler: async (
      params: {
        title: string;
        text?: string;
        collectionId: string;
        parentDocumentId?: string;
        publish?: boolean;
      },
      user: User,
      ctx: APIContext
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

      // Use documentCreator command to properly emit events for indexing, webhooks, etc.
      const document = await documentCreator({
        title,
        text,
        collectionId,
        parentDocumentId,
        publish,
        user,
        ctx,
      });

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
    description:
      "Edit/update an EXISTING document's title or content. Use documents_search or documents_list first to find the document ID you want to update.",
    inputSchema: z.object({
      id: z
        .string()
        .describe(
          "The document ID (UUID) or URL slug to update. Get this from documents_list or documents_search."
        ),
      title: z
        .string()
        .optional()
        .describe(
          "New title for the document. Leave empty to keep current title."
        ),
      text: z
        .string()
        .optional()
        .describe(
          "New content in Markdown format. By default REPLACES all existing content. Use 'append: true' to add to the end instead."
        ),
      append: z
        .boolean()
        .default(false)
        .describe(
          "If true, ADD the text to the end of the document instead of replacing everything. Useful for adding new sections."
        ),
    }),
    handler: async (
      params: {
        id: string;
        title?: string;
        text?: string;
        append?: boolean;
      },
      user: User,
      ctx: APIContext
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

      // Use documentUpdater command to properly emit events for indexing, webhooks, revisions, etc.
      const updatedDocument = await documentUpdater(ctx, {
        user,
        document,
        title,
        text,
        append,
        done: true, // Mark the editing session as complete
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: updatedDocument.id,
                title: updatedDocument.title,
                updatedAt: updatedDocument.updatedAt,
                url: updatedDocument.url,
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
