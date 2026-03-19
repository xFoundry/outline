import debounce from "lodash/debounce";
import isEmpty from "lodash/isEmpty";
import { observer } from "mobx-react";
import { CopyIcon, GlobeIcon, QuestionMarkIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled, { useTheme } from "styled-components";
import Flex from "@shared/components/Flex";
import Squircle from "@shared/components/Squircle";
import { s } from "@shared/styles";
import { UrlHelper } from "@shared/utils/UrlHelper";
import type Document from "~/models/Document";
import type Share from "~/models/Share";
import Switch from "~/components/Switch";
import env from "~/env";
import usePolicy from "~/hooks/usePolicy";
import { AvatarSize } from "../../Avatar";
import CopyToClipboard from "../../CopyToClipboard";
import NudeButton from "../../NudeButton";
import { ResizingHeightContainer } from "../../ResizingHeightContainer";
import Text from "../../Text";
import Tooltip from "../../Tooltip";
import { ListItem } from "../components/ListItem";
import {
  DomainPrefix,
  ShareLinkInput,
  StyledInfoIcon,
  UnderlinedLink,
} from "../components";
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

function PublicAccess(
  { document, share, sharedParents }: Props,
  ref: React.RefObject<HTMLDivElement>
) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [validationError, setValidationError] = React.useState("");
  const [urlId, setUrlId] = React.useState(share?.urlId);
  const [parentsExpanded, setParentsExpanded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const can = usePolicy(share);
  const documentAbilities = usePolicy(document);
  const canPublish = can.update && documentAbilities.share;
  const publishedParents = sharedParents.filter((item) => item.published);
  const visibleParents = parentsExpanded
    ? publishedParents
    : publishedParents.slice(0, MAX_VISIBLE_PARENTS);
  const hiddenParentsCount = Math.max(
    0,
    publishedParents.length - MAX_VISIBLE_PARENTS
  );

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

  const shareUrl = share?.url ?? "";
  const getParentShareUrl = (parentShare: Share) =>
    parentShare.url ? `${parentShare.url}${document.url}` : "";

  const copyButton = (
    <Tooltip content={t("Copy public link")} placement="top">
      <CopyToClipboard text={shareUrl} onCopy={handleCopied}>
        <NudeButton type="button" disabled={!share} style={{ marginRight: 3 }}>
          <CopyIcon color={theme.placeholder} size={18} />
        </NudeButton>
      </CopyToClipboard>
    </Tooltip>
  );

  return (
    <div ref={ref}>
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
            <StyledInfoIcon color={theme.textTertiary} />
            <span>
              {t(
                "Nested documents are not shared on the web. Toggle sharing to enable access, this will be the default behavior in the future"
              )}
              .
            </span>
          </Text>
        ) : null}
      </ResizingHeightContainer>

      {share?.published && share.includeChildDocuments && document.collectionId ? (
        <Section>
          <SectionHeading>
            {t("Includes nested documents")}
          </SectionHeading>
          <NestedDocsList
            documentId={document.id}
            collectionId={document.collectionId}
          />
        </Section>
      ) : null}

      {publishedParents.length ? (
        <Section>
          <SectionHeading>{t("Also accessible via")}</SectionHeading>
          {visibleParents.map((parentShare) => (
            <ParentShareItem key={parentShare.id}>
              <Text type="secondary" size="small">
                {parentShare.collectionId ? (
                  <Trans>
                    Collection{" "}
                    <UnderlinedLink to={`/collection/${parentShare.collectionId}`}>
                      {parentShare.sourceTitle}
                    </UnderlinedLink>
                  </Trans>
                ) : (
                  <Trans>
                    Document{" "}
                    <UnderlinedLink to={`/doc/${parentShare.documentId}`}>
                      {parentShare.sourceTitle}
                    </UnderlinedLink>
                  </Trans>
                )}
              </Text>
              <Tooltip content={t("Copy link")} placement="top">
                <CopyToClipboard
                  text={getParentShareUrl(parentShare)}
                  onCopy={handleParentCopied}
                >
                  <NudeButton type="button">
                    <CopyIcon color={theme.placeholder} size={16} />
                  </NudeButton>
                </CopyToClipboard>
              </Tooltip>
            </ParentShareItem>
          ))}
          {hiddenParentsCount > 0 ? (
            <ExpandButton
              type="button"
              onClick={() => setParentsExpanded((value) => !value)}
            >
              {parentsExpanded
                ? t("Show less")
                : t("Show {{ count }} more", { count: hiddenParentsCount })}
            </ExpandButton>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

const Section = styled.div`
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid ${s("divider")};
`;

const SectionHeading = styled.div`
  color: ${s("textSecondary")};
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
`;

const ParentShareItem = styled(Flex)`
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
`;

const ExpandButton = styled.button`
  margin-top: 8px;
  padding: 0;
  background: none;
  border: none;
  color: ${s("textSecondary")};
  cursor: pointer;
  font-size: 13px;

  &:hover {
    color: ${s("text")};
    text-decoration: underline;
  }
`;

export default observer(React.forwardRef(PublicAccess));
