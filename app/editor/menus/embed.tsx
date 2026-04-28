import {
  TrashIcon,
  AlignImageLeftIcon,
  AlignImageRightIcon,
  AlignImageCenterIcon,
  AlignFullWidthIcon,
  EditIcon,
} from "outline-icons";
import type { EditorState } from "prosemirror-state";
import * as React from "react";
import { isNodeActive } from "@shared/editor/queries/isNodeActive";
import type { MenuItem } from "@shared/editor/types";
import type { Dictionary } from "~/hooks/useDictionary";

export default function embedMenuItems(
  state: EditorState,
  readOnly: boolean | undefined,
  dictionary: Dictionary
): MenuItem[] {
  if (readOnly) {
    return [];
  }

  const { schema } = state;
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
      tooltip: dictionary.alignLeft,
      icon: <AlignImageLeftIcon />,
      active: isLeftAligned,
    },
    {
      name: "alignEmbedCenter",
      tooltip: dictionary.alignCenter,
      icon: <AlignImageCenterIcon />,
      active: (state) =>
        isNodeActive(schema.nodes.embed)(state) &&
        !isLeftAligned(state) &&
        !isRightAligned(state) &&
        !isFullWidthAligned(state),
    },
    {
      name: "alignEmbedRight",
      tooltip: dictionary.alignRight,
      icon: <AlignImageRightIcon />,
      active: isRightAligned,
    },
    {
      name: "alignEmbedFullWidth",
      tooltip: dictionary.alignFullWidth,
      icon: <AlignFullWidthIcon />,
      active: isFullWidthAligned,
    },
    {
      name: "separator",
    },
    {
      name: "editEmbedUrl",
      tooltip: dictionary.editEmbedUrl,
      icon: <EditIcon />,
    },
    {
      name: "deleteEmbed",
      tooltip: dictionary.deleteEmbed,
      icon: <TrashIcon />,
    },
  ];
}
