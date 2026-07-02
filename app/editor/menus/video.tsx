import {
  TrashIcon,
  AlignImageLeftIcon,
  AlignImageRightIcon,
  AlignImageCenterIcon,
  AlignFullWidthIcon,
} from "outline-icons";
import * as React from "react";
import { isNodeActive } from "@shared/editor/queries/isNodeActive";
import type { MenuItem, SelectionContext } from "@shared/editor/types";
import { t } from "i18next";

/**
 * Returns menu items for the video selection toolbar.
 *
 * @param ctx - the current selection context.
 * @returns an array of menu items.
 */
export default function videoMenuItems(ctx: SelectionContext): MenuItem[] {
  if (ctx.readOnly) {
    return [];
  }

  const { schema, state } = ctx;
  const isLeftAligned = isNodeActive(schema.nodes.video, {
    layoutClass: "left-50",
  });
  const isRightAligned = isNodeActive(schema.nodes.video, {
    layoutClass: "right-50",
  });
  const isFullWidthAligned = isNodeActive(schema.nodes.video, {
    layoutClass: "full-width",
  });

  return [
    {
      name: "alignVideoLeft",
      tooltip: t("Align left"),
      icon: <AlignImageLeftIcon />,
      active: isLeftAligned,
    },
    {
      name: "alignVideoCenter",
      tooltip: t("Align center"),
      icon: <AlignImageCenterIcon />,
      active: (s) =>
        isNodeActive(schema.nodes.video)(s) &&
        !isLeftAligned(s) &&
        !isRightAligned(s) &&
        !isFullWidthAligned(s),
    },
    {
      name: "alignVideoRight",
      tooltip: t("Align right"),
      icon: <AlignImageRightIcon />,
      active: isRightAligned,
    },
    {
      name: "alignVideoFullWidth",
      tooltip: t("Full width"),
      icon: <AlignFullWidthIcon />,
      active: isFullWidthAligned,
    },
    {
      name: "separator",
    },
    {
      name: "dimensions",
      tooltip: `${t("Width")} × ${t("Height")}`,
      visible: !isFullWidthAligned(state),
      skipIcon: true,
    },
    {
      name: "separator",
    },
    {
      name: "deleteVideo",
      tooltip: t("Delete video"),
      icon: <TrashIcon />,
    },
  ];
}
