import {
  AlignImageCenterIcon,
  AlignImageLeftIcon,
  AlignImageRightIcon,
  EditIcon,
  TrashIcon,
} from "outline-icons";
import { EditorState } from "prosemirror-state";
import * as React from "react";
import { isNodeActive } from "@shared/editor/queries/isNodeActive";
import { MenuItem } from "@shared/editor/types";
import { Dictionary } from "~/hooks/useDictionary";

export default function buttonMenuItems(
  state: EditorState,
  readOnly: boolean | undefined,
  dictionary: Dictionary
): MenuItem[] {
  if (readOnly) {
    return [];
  }

  const { schema } = state;
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
      tooltip: dictionary.editLink,
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
    },
    {
      name: "setButtonVariant",
      label: "Secondary",
      tooltip: "Secondary style",
      attrs: { variant: "secondary" },
      active: isNodeActive(schema.nodes.button, { variant: "secondary" }),
    },
    {
      name: "setButtonVariant",
      label: "Outline",
      tooltip: "Outline style",
      attrs: { variant: "outline" },
      active: isNodeActive(schema.nodes.button, { variant: "outline" }),
    },
    {
      name: "separator",
    },
    {
      name: "alignButtonLeft",
      tooltip: dictionary.alignLeft,
      icon: <AlignImageLeftIcon />,
      active: isLeftAligned,
    },
    {
      name: "alignButtonCenter",
      tooltip: dictionary.alignCenter,
      icon: <AlignImageCenterIcon />,
      active: isCenterAligned,
    },
    {
      name: "alignButtonRight",
      tooltip: dictionary.alignRight,
      icon: <AlignImageRightIcon />,
      active: isRightAligned,
    },
    {
      name: "separator",
    },
    {
      name: "deleteButton",
      tooltip: dictionary.deleteButton,
      icon: <TrashIcon />,
    },
  ];
}
