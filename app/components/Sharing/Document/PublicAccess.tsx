import debounce from "lodash/debounce";
import isEmpty from "lodash/isEmpty";
import { observer } from "mobx-react";
import { CopyIcon, GlobeIcon, InfoIcon, QuestionMarkIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import styled, { useTheme } from "styled-components";
import Flex from "@shared/components/Flex";
import Squircle from "@shared/components/Squircle";
import { s } from "@shared/styles";
import { UrlHelper } from "@shared/utils/UrlHelper";
import Document from "~/models/Document";
import Share from "~/models/Share";
import Input, { NativeInput } from "~/components/Input";
import Switch from "~/components/Switch";
import env from "~/env";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import { AvatarSize } from "../../Avatar";
import CopyToClipboard from "../../CopyToClipboard";
import NudeButton from "../../NudeButton";
import { ResizingHeightContainer } from "../../ResizingHeightContainer";
import Text from "../../Text";
import Tooltip from "../../Tooltip";
import { ListItem } from "../components/ListItem";
import NestedDocsList from "./NestedDocsList";

type Props = {
  /** The document to share. */
  document: Document;
  /** The existing share model, if any. */
  share: Share | null | undefined;
  /** All parent shares that include this document. */
  sharedParents: Share[];
  /** Ref to the Copy Link button */
  copyButtonRef?: React.RefObject<HTMLButtonElement>;
  onRequestClose?: () => void;
};

const MAX_VISIBLE_PARENTS = 3;

function PublicAccess({ document, share, sharedParents }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { collections } = useStores();
  const [validationError, setValidationError] = React.useState("");
  const [urlId, setUrlId] = React.useState(share?.urlId);
  const [parentsExpanded, setParentsExpanded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const can = usePolicy(share);
  const documentAbilities = usePolicy(document);
  const canPublish = can.update && documentAbilities.share;

  // Filter to only published parent shares
  const publishedParents = sharedParents.filter((s) => s.published);
  const hasParentShares = publishedParents.length > 0 && !document.isDraft;

  React.useEffect(() => {
    setUrlId(share?.urlId);
  }, [share?.urlId]);

  const handleIndexingChanged = React.useCallback(
    async (checked: boolean) => {
      try {
        await share?.save({
          allowIndexing: checked,
        });
      } catch (err) {
        toast.error(err.message);
      }
    },
    [share]
  );

  const handleShowLastModifiedChanged = React.useCallback(
    async (checked: boolean) => {
      try {
        await share?.save({
          showLastUpdated: checked,
        });
      } catch (err) {
        toast.error(err.message);
      }
    },
    [share]
  );

  const handleShowTOCChanged = React.useCallback(
    async (checked: boolean) => {
      try {
        await share?.save({
          showTOC: checked,
        });
      } catch (err) {
        toast.error(err.message);
      }
    },
    [share]
  );

  const handlePublishedChange = React.useCallback(
    async (checked: boolean) => {
      try {
        await share?.save({
          published: checked,
        });
      } catch (err) {
        toast.error(err.message);
      }
    },
    [share]
  );

  const handleUrlChange = React.useMemo(
    () =>
      debounce(async (ev) => {
        if (!share) {
          return;
        }

        const val = ev.target.value;
        setUrlId(val);
        if (val && !UrlHelper.SHARE_URL_SLUG_REGEX.test(val)) {
          setValidationError(
            t("Only lowercase letters, digits and dashes allowed")
          );
        } else {
          setValidationError("");
          if (share.urlId !== val) {
            try {
              await share.save({
                urlId: isEmpty(val) ? null : val,
              });
            } catch (err) {
              if (err.message.includes("must be unique")) {
                setValidationError(t("Sorry, this link has already been used"));
              }
            }
          }
        }
      }, 500),
    [t, share]
  );

  const handleCopied = React.useCallback(() => {
    toast.success(t("Public link copied to clipboard"));
  }, [t]);

  const handleParentCopied = React.useCallback(() => {
    toast.success(t("Link copied to clipboard"));
  }, [t]);

  // Direct share URL for this specific document
  const directShareUrl = share?.url ?? "";

  const copyButton = (
    <Tooltip content={t("Copy public link")} placement="top">
      <CopyToClipboard text={directShareUrl} onCopy={handleCopied}>
        <NudeButton type="button" disabled={!share} style={{ marginRight: 3 }}>
          <CopyIcon color={theme.placeholder} size={18} />
        </NudeButton>
      </CopyToClipboard>
    </Tooltip>
  );

  // Get parent share URL (parent's share link + this document's path)
  const getParentShareUrl = (parentShare: Share) =>
    parentShare.url ? `${parentShare.url}${document.url}` : "";

  // Get nested documents count for this share
  const collection = document.collectionId
    ? collections.get(document.collectionId)
    : null;
  const docTree = collection?.getDocumentTree(document.id);
  const hasNestedDocs =
    share?.published &&
    share.includeChildDocuments &&
    docTree?.children &&
    docTree.children.length > 0;

  const visibleParents = parentsExpanded
    ? publishedParents
    : publishedParents.slice(0, MAX_VISIBLE_PARENTS);
  const hiddenParentsCount = parentsExpanded
    ? 0
    : publishedParents.length - MAX_VISIBLE_PARENTS;

  return (
    <Wrapper>
      <ListItem
        title={t("Web")}
        subtitle={t("Allow anyone with the link to access")}
        image={
          <Squircle color={theme.text} size={AvatarSize.Medium}>
            <GlobeIcon color={theme.background} size={18} />
          </Squircle>
        }
        actions={
          <Switch
            aria-label={t("Publish to internet")}
            checked={share?.published ?? false}
            onChange={handlePublishedChange}
            disabled={!canPublish}
            width={26}
            height={14}
          />
        }
      />

      <ResizingHeightContainer>
        {share?.published && (
          <>
            <ListItem
              title={
                <Text type="tertiary" as={Flex}>
                  {t("Search engine indexing")}&nbsp;
                  <Tooltip
                    content={t(
                      "Disable this setting to discourage search engines from indexing the page"
                    )}
                  >
                    <NudeButton size={18}>
                      <QuestionMarkIcon size={18} />
                    </NudeButton>
                  </Tooltip>
                </Text>
              }
              actions={
                <Switch
                  aria-label={t("Search engine indexing")}
                  checked={share?.allowIndexing ?? false}
                  onChange={handleIndexingChanged}
                  width={26}
                  height={14}
                />
              }
            />
            <ListItem
              title={
                <Text type="tertiary" as={Flex}>
                  {t("Show last modified")}&nbsp;
                  <Tooltip
                    content={t(
                      "Display the last modified timestamp on the shared page"
                    )}
                  >
                    <NudeButton size={18}>
                      <QuestionMarkIcon size={18} />
                    </NudeButton>
                  </Tooltip>
                </Text>
              }
              actions={
                <Switch
                  aria-label={t("Show last modified")}
                  checked={share?.showLastUpdated ?? false}
                  onChange={handleShowLastModifiedChanged}
                  width={26}
                  height={14}
                />
              }
            />
            <ListItem
              title={
                <Text type="tertiary" as={Flex}>
                  {t("Show table of contents")}&nbsp;
                  <Tooltip
                    content={t(
                      "Display the table of contents on documents by default"
                    )}
                  >
                    <NudeButton size={18}>
                      <QuestionMarkIcon size={18} />
                    </NudeButton>
                  </Tooltip>
                </Text>
              }
              actions={
                <Switch
                  aria-label={t("Show table of contents")}
                  checked={share?.showTOC ?? false}
                  onChange={handleShowTOCChanged}
                  width={26}
                  height={14}
                />
              }
            />
          </>
        )}

        {share?.published ? (
          <ShareLinkInput
            type="text"
            ref={inputRef}
            placeholder={share?.id}
            onChange={handleUrlChange}
            error={validationError}
            defaultValue={urlId}
            prefix={
              <DomainPrefix onClick={() => inputRef.current?.focus()}>
                {env.URL.replace(/https?:\/\//, "") + "/s/"}
              </DomainPrefix>
            }
          >
            {copyButton}
          </ShareLinkInput>
        ) : null}

        {share?.published && !share.includeChildDocuments ? (
          <Text as="p" type="tertiary" size="xsmall">
            <StyledInfoIcon size={18} />
            <span>
              {t(
                "Nested documents are not shared on the web. Toggle sharing to enable access, this will be the default behavior in the future"
              )}
              .
            </span>
          </Text>
        ) : null}
      </ResizingHeightContainer>

      {/* Nested documents section */}
      {hasNestedDocs && (
        <NestedDocsSection>
          <SectionHeader>
            <Text type="secondary" weight="medium" size="small">
              {t("Includes nested documents")}
            </Text>
          </SectionHeader>
          <NestedDocsList
            documentId={document.id}
            collectionId={document.collectionId}
            maxVisible={5}
          />
        </NestedDocsSection>
      )}

      {/* Parent shares section */}
      {hasParentShares && (
        <ParentSharesSection>
          <SectionHeader>
            <Squircle color={theme.textTertiary} size={AvatarSize.Small}>
              <InfoIcon color={theme.background} size={14} />
            </Squircle>
            <Text type="secondary" weight="medium" size="small">
              {t("Also accessible via")}
            </Text>
          </SectionHeader>

          {visibleParents.map((parentShare) => (
            <ParentShareItem key={parentShare.id}>
              <ParentShareInfo>
                {parentShare.collectionId ? (
                  <Trans>
                    Collection{" "}
                    <StyledLink to={`/collection/${parentShare.collectionId}`}>
                      {parentShare.sourceTitle}
                    </StyledLink>
                  </Trans>
                ) : (
                  <StyledLink to={`/doc/${parentShare.documentId}`}>
                    {parentShare.sourceTitle}
                  </StyledLink>
                )}
              </ParentShareInfo>
              <Tooltip content={t("Copy link")} placement="top">
                <CopyToClipboard
                  text={getParentShareUrl(parentShare)}
                  onCopy={handleParentCopied}
                >
                  <CopyButton>
                    <CopyIcon color={theme.textTertiary} size={16} />
                  </CopyButton>
                </CopyToClipboard>
              </Tooltip>
            </ParentShareItem>
          ))}

          {hiddenParentsCount > 0 && (
            <ExpandButton onClick={() => setParentsExpanded(!parentsExpanded)}>
              {parentsExpanded
                ? t("Show less")
                : t("Show {{ count }} more", { count: hiddenParentsCount })}
            </ExpandButton>
          )}
        </ParentSharesSection>
      )}
    </Wrapper>
  );
}

const StyledInfoIcon = styled(InfoIcon)`
  vertical-align: bottom;
  margin-right: 2px;
`;

const Wrapper = styled.div`
  padding-bottom: 8px;
`;

const SectionHeader = styled(Flex)`
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`;

const NestedDocsSection = styled.div`
  margin-top: 16px;
  padding: 12px 16px;
  background: ${s("backgroundSecondary")};
  border-radius: 8px;
`;

const ParentSharesSection = styled.div`
  margin-top: 16px;
  padding: 12px 16px;
  background: ${s("backgroundSecondary")};
  border-radius: 8px;
`;

const ParentShareItem = styled(Flex)`
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  gap: 8px;

  &:not(:last-child) {
    border-bottom: 1px solid ${s("divider")};
  }
`;

const ParentShareInfo = styled(Text).attrs({ size: "small" })`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CopyButton = styled(NudeButton)`
  flex-shrink: 0;
  padding: 4px;
  border-radius: 4px;

  &:hover {
    background: ${s("backgroundTertiary")};
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

const DomainPrefix = styled.span`
  padding: 0 2px 0 8px;
  flex: 0 1 auto;
  cursor: text;
  color: ${s("placeholder")};
  user-select: none;
`;

const ShareLinkInput = styled(Input)`
  margin-top: 12px;
  min-width: 100px;
  flex: 1;

  ${NativeInput}:not(:first-child) {
    padding: 4px 8px 4px 0;
    flex: 1;
  }
`;

const StyledLink = styled(Link)`
  color: ${s("textSecondary")};
  text-decoration: underline;
`;

export default observer(PublicAccess);
