import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";
import isUUID from "validator/lib/isUUID";
import type { NavigationNode } from "@shared/types";
import { UrlHelper } from "@shared/utils/UrlHelper";
import {
  AuthorizationError,
  InvalidRequestError,
  NotFoundError,
  PaymentRequiredError,
} from "@server/errors";
import type { User } from "@server/models";
import { Collection, Document, Share } from "@server/models";
import { authorize, can } from "@server/policies";

type LoadPublicShareProps = {
  id: string;
  collectionId?: string;
  documentId?: string;
  teamId?: string;
};

export async function loadPublicShare({
  id,
  collectionId,
  documentId,
  teamId,
}: LoadPublicShareProps) {
  const urlId =
    !isUUID(id) && UrlHelper.SHARE_URL_SLUG_REGEX.test(id) ? id : undefined;

  if (urlId && !teamId) {
    throw InvalidRequestError("teamId required for fetching share using urlId");
  }

  const where: WhereOptions<Share> = {
    revokedAt: {
      [Op.is]: null,
    },
    published: true,
  };

  if (urlId) {
    where.urlId = id;
    where.teamId = teamId;
  } else {
    where.id = id;
  }

  const share = await Share.findOne({
    where,
    include: [
      {
        model: Document.scope("withDrafts"),
        as: "document",
        include: [
          {
            model: Collection.scope("withDocumentStructure"),
            as: "collection",
            required: false,
          },
        ],
      },
      {
        model: Collection.scope("withDocumentStructure"),
        as: "collection",
      },
    ],
  });

  if (
    !share ||
    !!share.team.suspendedAt ||
    !!share.collection?.archivedAt ||
    !!share.document?.archivedAt
  ) {
    throw NotFoundError();
  }

  const isDraftWithoutCollection =
    !!share.document?.isDraft && !share.document.collectionId;
  const associatedCollection = share.collection ?? share.document?.collection;

  if (
    !share.team.sharing ||
    (!isDraftWithoutCollection && !associatedCollection?.sharing)
  ) {
    throw AuthorizationError();
  }

  let sharedTree: NavigationNode | null = null;
  let document: Document | null = null;

  if (share.collection) {
    sharedTree = associatedCollection?.toNavigationNode() ?? null;
  } else if (share.document && share.includeChildDocuments) {
    sharedTree =
      associatedCollection?.getDocumentTree(share.document.id) ?? null;
  }

  if (sharedTree && share.domain) {
    sharedTree.url = "";
  }

  if (collectionId && collectionId !== share.collectionId) {
    throw AuthorizationError();
  }

  if (documentId && documentId !== share.documentId) {
    document = await Document.findByPk(documentId, {
      rejectOnEmpty: true,
    });

    let isDocumentAccessible = share.documentId === document.id;

    if (share.includeChildDocuments) {
      const allIdsInSharedTree = getAllIdsInSharedTree(sharedTree);
      isDocumentAccessible = allIdsInSharedTree.includes(document.id);
    }

    if (!isDocumentAccessible) {
      throw AuthorizationError();
    }
  } else {
    document = share.document;
  }

  if (document?.isTrialImport) {
    throw PaymentRequiredError();
  }

  return {
    share,
    sharedTree,
    collection: share.collection,
    document,
  };
}

type LoadShareWithParentProps = {
  collectionId?: string;
  documentId?: string;
  user: User;
};

export async function loadShareWithParent({
  collectionId,
  documentId,
  user,
}: LoadShareWithParentProps) {
  const where: WhereOptions<Share> = {
    revokedAt: {
      [Op.is]: null,
    },
    teamId: user.teamId,
  };

  if (collectionId) {
    where.collectionId = collectionId;
  } else if (documentId) {
    where.documentId = documentId;
  }

  const share = await Share.scope({
    method: ["withCollectionPermissions", user.id],
  }).findOne({ where });

  if (!share) {
    throw NotFoundError();
  }

  authorize(user, "read", share);

  if (collectionId) {
    authorize(user, "read", share.collection);
  }

  let parentShares: Share[] = [];

  // Load all parent shares for the share UI. Parent shares are only applicable
  // to documents because collections do not have parents.
  if (documentId) {
    authorize(user, "read", share.document);

    const docCollectionId = share.document.collectionId;

    if (!docCollectionId) {
      throw NotFoundError("Collection not found for the shared document");
    }

    const docCollection = await Collection.findByPk(docCollectionId, {
      userId: user.id,
      includeDocumentStructure: true,
      rejectOnEmpty: true,
    });

    const collectionShare = await Share.scope({
      method: ["withCollectionPermissions", user.id],
    }).findOne({
      where: {
        revokedAt: {
          [Op.is]: null,
        },
        published: true,
        teamId: user.teamId,
        collectionId: docCollectionId,
      },
    });

    if (collectionShare && can(user, "read", collectionShare)) {
      parentShares.push(collectionShare);
    }

    const parentDocIds = docCollection.getDocumentParents(documentId);
    if (parentDocIds && parentDocIds.length > 0) {
      const allParentShares = await Share.scope({
        method: ["withCollectionPermissions", user.id],
      }).findAll({
        where: {
          revokedAt: {
            [Op.is]: null,
          },
          published: true,
          teamId: user.teamId,
          includeChildDocuments: true,
          documentId: parentDocIds,
        },
      });

      parentShares.push(...allParentShares.filter((item) => can(user, "read", item)));
    }
  }

  return {
    share,
    parentShare: parentShares[0] ?? null,
    parentShares,
  };
}

/**
 * Recursively extracts all document IDs from a shared tree navigation node.
 *
 * @param sharedTree The navigation node representing the shared tree.
 * @returns Array of all document IDs in the tree.
 */
export function getAllIdsInSharedTree(
  sharedTree: NavigationNode | null
): string[] {
  if (!sharedTree) {
    return [];
  }

  const ids = [sharedTree.id];
  for (const child of sharedTree.children) {
    ids.push(...getAllIdsInSharedTree(child));
  }
  return ids;
}
