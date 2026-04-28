import { observer } from "mobx-react";
import { GlobeIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { UserPreference } from "@shared/types";
import { ProsemirrorHelper } from "@shared/utils/ProsemirrorHelper";
import type Collection from "~/models/Collection";
import type Document from "~/models/Document";
import type { RefHandle } from "~/components/EditableTitle";
import NudeButton from "~/components/NudeButton";
import Tooltip from "~/components/Tooltip";
import useBoolean from "~/hooks/useBoolean";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import useCurrentUser from "~/hooks/useCurrentUser";
import { useCollectionMenuAction } from "~/hooks/useCollectionMenuAction";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import CollectionMenu from "~/menus/CollectionMenu";
import { NotFoundError } from "~/utils/errors";
import { documentEditPath } from "~/utils/routeHelpers";
import { useDropToChangeCollection } from "../hooks/useDragAndDrop";
import CollectionLinkChildren from "./CollectionLinkChildren";
import CollectionRow from "./CollectionRow";
import { useSidebarContext } from "./SidebarContext";

type Props = {
  collection: Collection;
  expanded?: boolean;
  onDisclosureClick: (ev?: React.MouseEvent<HTMLElement>) => void;
  activeDocument: Document | undefined;
  isDraggingAnyCollection?: boolean;
  depth?: number;
  onClick?: () => void;
};

const CollectionLink: React.FC<Props> = ({
  collection,
  expanded,
  onDisclosureClick,
  isDraggingAnyCollection,
  depth,
  onClick,
}: Props) => {
  const [menuOpen, handleMenuOpen, handleMenuClose] = useBoolean();
  const { documents, shares } = useStores();
  const { t } = useTranslation();
  const history = useHistory();
  const can = usePolicy(collection);
  const sidebarContext = useSidebarContext();
  const team = useCurrentTeam();
  const user = useCurrentUser();
  const editableTitleRef = React.useRef<RefHandle>(null);
  const share = shares.getByCollectionId(collection.id);
  const isPubliclyShared =
    team.sharing !== false && collection.sharing !== false && share?.published;

  const handleTitleChange = React.useCallback(
    async (name: string) => {
      await collection.save({ name });
    },
    [collection]
  );

  const handleExpand = React.useCallback(() => {
    if (!expanded) {
      onDisclosureClick();
    }
  }, [expanded, onDisclosureClick]);

  const parentRef = React.useRef<HTMLDivElement>(null);
  const [{ isOver, canDrop }, dropRef] = useDropToChangeCollection(
    collection,
    handleExpand,
    parentRef
  );

  const handlePrefetch = React.useCallback(() => {
    void collection.fetchDocuments();
    void shares.fetchOne({ collectionId: collection.id }).catch((err) => {
      if (!(err instanceof NotFoundError)) {
        throw err;
      }
    });
  }, [collection, shares]);

  const handleRename = React.useCallback(() => {
    editableTitleRef.current?.setIsEditing(true);
  }, []);

  const handleNewDoc = React.useCallback(
    async (input: string) => {
      const newDocument = await documents.create(
        {
          collectionId: collection.id,
          title: input,
          fullWidth: user.getPreference(UserPreference.FullWidthDocuments),
          data: ProsemirrorHelper.getEmptyDocument(),
        },
        { publish: true }
      );
      collection?.addDocument(newDocument);
      history.push({
        pathname: documentEditPath(newDocument),
        state: { sidebarContext },
      });
    },
    [user, sidebarContext, history, collection, documents]
  );

  const contextMenuAction = useCollectionMenuAction({
    collectionId: collection.id,
    onRename: handleRename,
  });

  const menu = !isDraggingAnyCollection ? (
    <>
      {isPubliclyShared ? (
        <Tooltip content={t("Public sharing enabled")} delay={500}>
          <NudeButton
            aria-label={t("Public sharing enabled")}
            onClick={(ev) => ev.preventDefault()}
          >
            <GlobeIcon />
          </NudeButton>
        </Tooltip>
      ) : null}
      <CollectionMenu
        collection={collection}
        onRename={handleRename}
        onOpen={handleMenuOpen}
        onClose={handleMenuClose}
      />
    </>
  ) : undefined;

  return (
    <CollectionRow
      collection={collection}
      depth={depth}
      to={{ pathname: collection.path, state: { sidebarContext } }}
      onClick={onClick}
      onClickIntent={handlePrefetch}
      expanded={expanded}
      onDisclosureClick={onDisclosureClick}
      onExpand={handleExpand}
      canEdit={can.update}
      labelText={collection.name}
      onTitleChange={handleTitleChange}
      editableTitleRef={editableTitleRef}
      contextAction={contextMenuAction}
      menu={menu}
      menuOpen={menuOpen}
      canCreateChild={!isDraggingAnyCollection && can.createDocument}
      onCreateChild={handleNewDoc}
      parentRef={parentRef}
      dropRef={dropRef}
      isActiveDropTarget={isOver && canDrop}
    >
      <CollectionLinkChildren
        collection={collection}
        expanded={!!expanded}
        prefetchDocument={documents.prefetchDocument}
      />
    </CollectionRow>
  );
};

export default observer(CollectionLink);
