import {
  AlignImageCenterIcon,
  AlignImageLeftIcon,
  AlignImageRightIcon,
  EditIcon,
  TrashIcon,
} from "outline-icons";
import * as React from "react";
import { isNodeActive } from "@shared/editor/queries/isNodeActive";
import type { MenuItem, SelectionContext } from "@shared/editor/types";
import { t } from "i18next";

/**
 * Returns menu items for the button selection toolbar.
 *
 * @param ctx - the current selection context.
 * @returns an array of menu items.
 */
export default function buttonMenuItems(ctx: SelectionContext): MenuItem[] {
  if (ctx.readOnly) {
    return [];
  }

  const { schema } = ctx;
  const isLeftAligned = isNodeActive(schema.nodes.button, {
    alignment: "left",
  });
  const isCenterAligned = isNodeActive(schema.nodes.button, {
    alignment: "center",
  });
  const isRightAligned = isNodeActive(schema.nodes.button, {
    alignment: "right",
  });

  return [
    {
      name: "editButtonUrl",
      tooltip: t("Edit link"),
      icon: <EditIcon />,
    },
    {
      name: "separator",
    },
    {
      name: "setButtonVariant",
      label: "Primary",
      tooltip: "Primary style",
      attrs: { variant: "primary" },
      active: isNodeActive(schema.nodes.button, { variant: "primary" }),
      skipIcon: true,
    },
    {
      name: "setButtonVariant",
      label: "Secondary",
      tooltip: "Secondary style",
      attrs: { variant: "secondary" },
      active: isNodeActive(schema.nodes.button, { variant: "secondary" }),
      skipIcon: true,
    },
    {
      name: "setButtonVariant",
      label: "Outline",
      tooltip: "Outline style",
      attrs: { variant: "outline" },
      active: isNodeActive(schema.nodes.button, { variant: "outline" }),
      skipIcon: true,
    },
    {
      name: "separator",
    },
    {
      name: "alignButtonLeft",
      tooltip: t("Align left"),
      icon: <AlignImageLeftIcon />,
      active: isLeftAligned,
    },
    {
      name: "alignButtonCenter",
      tooltip: t("Align center"),
      icon: <AlignImageCenterIcon />,
      active: isCenterAligned,
    },
    {
      name: "alignButtonRight",
      tooltip: t("Align right"),
      icon: <AlignImageRightIcon />,
      active: isRightAligned,
    },
    {
      name: "separator",
    },
    {
      name: "deleteButton",
      tooltip: t("Delete button"),
      icon: <TrashIcon />,
    },
  ];
}
