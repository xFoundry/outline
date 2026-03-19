import { OpenIcon, TrashIcon } from "outline-icons";
import type { Node } from "prosemirror-model";
import { NodeSelection, Selection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import Flex from "~/components/Flex";
import Tooltip from "~/components/Tooltip";
import Input from "~/editor/components/Input";
import type { Dictionary } from "~/hooks/useDictionary";
import ToolbarButton from "./ToolbarButton";

type Props = {
  node?: Node;
  view: EditorView;
  dictionary: Dictionary;
  autoFocus?: boolean;
};

export function ButtonEditor({ node, view, dictionary, autoFocus }: Props) {
  const [localLabel, setLocalLabel] = useState(
    (node?.attrs.label as string) ?? ""
  );
  const [localHref, setLocalHref] = useState((node?.attrs.href as string) ?? "");

  useEffect(() => {
    setLocalLabel((node?.attrs.label as string) ?? "");
    setLocalHref((node?.attrs.href as string) ?? "");
  }, [node]);

  const moveSelectionToEnd = useCallback(() => {
    const { state, dispatch } = view;
    const nextSelection = Selection.findFrom(
      state.tr.doc.resolve(state.selection.from),
      1,
      true
    );

    const selection = nextSelection ?? TextSelection.create(state.tr.doc, 0);
    dispatch(state.tr.setSelection(selection));
    view.focus();
  }, [view]);

  const openLink = useCallback(() => {
    if (localHref) {
      window.open(localHref, "_blank");
    }
  }, [localHref]);

  const remove = useCallback(() => {
    if (!node) {
      return;
    }

    const { state, dispatch } = view;
    dispatch(state.tr.deleteSelection());
  }, [node, view]);

  const update = useCallback(() => {
    if (!node) {
      return;
    }

    const { state } = view;
    if (!(state.selection instanceof NodeSelection)) {
      return;
    }

    const tr = state.tr.setNodeMarkup(state.selection.from, undefined, {
      ...node.attrs,
      label: localLabel,
      href: localHref,
    });

    view.dispatch(tr);
    moveSelectionToEnd();
  }, [localLabel, localHref, node, view, moveSelectionToEnd]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }

      switch (event.key) {
        case "Enter": {
          event.preventDefault();
          update();
          return;
        }

        case "Escape": {
          event.preventDefault();
          moveSelectionToEnd();
          return;
        }
      }
    },
    [update, moveSelectionToEnd]
  );

  if (!node) {
    return null;
  }

  return (
    <Wrapper>
      <InputGroup>
        <Label>Text</Label>
        <Input
          autoFocus={autoFocus}
          value={localLabel}
          placeholder="Button text"
          onChange={(e) => setLocalLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={!view.editable}
        />
      </InputGroup>
      <InputGroup>
        <Label>Link</Label>
        <Input
          value={localHref}
          placeholder={dictionary.pasteLink}
          onChange={(e) => setLocalHref(e.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={!view.editable}
        />
      </InputGroup>
      <ButtonGroup>
        <Tooltip content={dictionary.openLink}>
          <ToolbarButton onClick={openLink} disabled={!localHref}>
            <OpenIcon />
          </ToolbarButton>
        </Tooltip>
        {view.editable && (
          <Tooltip content={dictionary.deleteButton}>
            <ToolbarButton onClick={remove}>
              <TrashIcon />
            </ToolbarButton>
          </Tooltip>
        )}
      </ButtonGroup>
    </Wrapper>
  );
}

const Wrapper = styled(Flex)`
  pointer-events: all;
  gap: 8px;
  padding: 8px;
  flex-direction: column;
  min-width: 300px;
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 500;
  color: ${(props) => props.theme.textTertiary};
`;

const ButtonGroup = styled(Flex)`
  gap: 4px;
  justify-content: flex-end;
`;
