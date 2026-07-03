import {
  TrashIcon,
  AlignImageLeftIcon,
  AlignImageRightIcon,
  AlignImageCenterIcon,
  AlignFullWidthIcon,
  EditIcon,
} from "outline-icons";
import * as React from "react";
import { isNodeActive } from "@shared/editor/queries/isNodeActive";
import type { MenuItem, SelectionContext } from "@shared/editor/types";
import { t } from "i18next";

/**
 * Returns menu items for the embed selection toolbar.
 *
 * @param ctx - the current selection context.
 * @returns an array of menu items.
 */
export default function embedMenuItems(ctx: SelectionContext): MenuItem[] {
  if (ctx.readOnly) {
    return [];
  }

  const { schema } = ctx;
  const isLeftAligned = isNodeActive(schema.nodes.embed, {
    layoutClass: "left-50",
  });
  const isRightAligned = isNodeActive(schema.nodes.embed, {
    layoutClass: "right-50",
  });
  const isFullWidthAligned = isNodeActive(schema.nodes.embed, {
    layoutClass: "full-width",
  });

  return [
    {
      name: "alignEmbedLeft",
      tooltip: t("Align left"),
      icon: <AlignImageLeftIcon />,
      active: isLeftAligned,
    },
    {
      name: "alignEmbedCenter",
      tooltip: t("Align center"),
      icon: <AlignImageCenterIcon />,
      active: (s) =>
        isNodeActive(schema.nodes.embed)(s) &&
        !isLeftAligned(s) &&
        !isRightAligned(s) &&
        !isFullWidthAligned(s),
    },
    {
      name: "alignEmbedRight",
      tooltip: t("Align right"),
      icon: <AlignImageRightIcon />,
      active: isRightAligned,
    },
    {
      name: "alignEmbedFullWidth",
      tooltip: t("Full width"),
      icon: <AlignFullWidthIcon />,
      active: isFullWidthAligned,
    },
    {
      name: "separator",
    },
    {
      name: "editEmbedUrl",
      tooltip: t("Edit embed URL"),
      icon: <EditIcon />,
    },
    {
      name: "deleteEmbed",
      tooltip: t("Delete embed"),
      icon: <TrashIcon />,
    },
  ];
}
