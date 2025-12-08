import { observer } from "mobx-react";
import { DocumentIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import styled from "styled-components";
import type { NavigationNode } from "@shared/types";
import { s } from "@shared/styles";
import Text from "~/components/Text";
import useStores from "~/hooks/useStores";

type Props = {
  /** The document ID to show nested documents for */
  documentId: string;
  /** The collection ID containing the document */
  collectionId: string | null;
  /** Maximum number of items to show before collapsing (default: 5) */
  maxVisible?: number;
};

function NestedDocsList({ documentId, collectionId, maxVisible = 5 }: Props) {
  const { t } = useTranslation();
  const { collections } = useStores();
  const [expanded, setExpanded] = React.useState(false);

  const collection = collectionId ? collections.get(collectionId) : null;
  const docTree = collection?.getDocumentTree(documentId);
  const children = docTree?.children ?? [];

  // Count total descendants recursively
  const countDescendants = React.useCallback(
    (nodes: NavigationNode[]): number =>
      nodes.reduce(
        (sum, node) => sum + 1 + countDescendants(node.children ?? []),
        0
      ),
    []
  );

  const totalCount = countDescendants(children);

  if (totalCount === 0) {
    return (
      <Text type="tertiary" size="small">
        {t("No nested documents")}
      </Text>
    );
  }

  // Render a single node with depth-based indentation
  const renderNode = (node: NavigationNode, depth: number): React.ReactNode => (
    <React.Fragment key={node.id}>
      <NestedDocItem style={{ paddingLeft: depth * 16 }}>
        <StyledDocumentIcon size={16} />
        <DocTitle to={node.url}>{node.title || t("Untitled")}</DocTitle>
      </NestedDocItem>
      {(node.children ?? []).map((child) => renderNode(child, depth + 1))}
    </React.Fragment>
  );

  // Render items with a limit, preserving hierarchy
  const renderWithLimit = (
    nodes: NavigationNode[],
    depth: number,
    remaining: number
  ): [React.ReactNode[], number] => {
    const result: React.ReactNode[] = [];
    let left = remaining;

    for (const node of nodes) {
      if (left <= 0) {
        break;
      }

      result.push(
        <NestedDocItem key={node.id} style={{ paddingLeft: depth * 16 }}>
          <StyledDocumentIcon size={16} />
          <DocTitle to={node.url}>{node.title || t("Untitled")}</DocTitle>
        </NestedDocItem>
      );
      left--;

      if (left > 0 && node.children && node.children.length > 0) {
        const [childNodes, newLeft] = renderWithLimit(
          node.children,
          depth + 1,
          left
        );
        result.push(...childNodes);
        left = newLeft;
      }
    }

    return [result, left];
  };

  const hiddenCount = totalCount - maxVisible;

  return (
    <>
      {expanded
        ? children.map((node) => renderNode(node, 0))
        : renderWithLimit(children, 0, maxVisible)[0]}
      {hiddenCount > 0 && (
        <ExpandButton onClick={() => setExpanded(!expanded)}>
          {expanded
            ? t("Show less")
            : t("Show {{ count }} more", { count: hiddenCount })}
        </ExpandButton>
      )}
    </>
  );
}

const NestedDocItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
`;

const StyledDocumentIcon = styled(DocumentIcon)`
  flex-shrink: 0;
  color: ${s("textTertiary")};
`;

const DocTitle = styled(Link)`
  color: ${s("text")};
  text-decoration: none;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`;

const ExpandButton = styled.button`
  display: block;
  width: 100%;
  padding: 8px 0 0 0;
  margin-top: 4px;
  background: none;
  border: none;
  color: ${s("textSecondary")};
  font-size: 13px;
  cursor: pointer;
  text-align: left;

  &:hover {
    color: ${s("text")};
    text-decoration: underline;
  }
`;

export default observer(NestedDocsList);
