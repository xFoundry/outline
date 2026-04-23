import type { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import type { Command} from "prosemirror-state";
import { NodeSelection } from "prosemirror-state";
import * as React from "react";
import styled from "styled-components";
import type { Primitive } from "utility-types";
import { s } from "../../styles";
import { sanitizeUrl } from "../../utils/urls";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import type { ComponentProps } from "../types";
import Node from "./Node";

type ButtonVariant = "primary" | "secondary" | "outline";
type ButtonAlignment = "left" | "center" | "right";

export default class Button extends Node {
  get name() {
    return "button";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        href: {
          default: "",
          validate: "string",
        },
        label: {
          default: "Button",
          validate: "string",
        },
        variant: {
          default: "primary",
          validate: "string",
        },
        alignment: {
          default: "center",
          validate: "string",
        },
      },
      group: "block",
      defining: true,
      atom: true,
      draggable: true,
      parseDOM: [
        {
          tag: "div.editor-button-wrapper",
          getAttrs: (dom: HTMLDivElement) => {
            const button = dom.querySelector("button");
            return {
              href: dom.dataset.href || "",
              label: button?.textContent || "Button",
              variant: dom.dataset.variant || "primary",
              alignment: dom.dataset.alignment || "center",
            };
          },
        },
      ],
      toDOM: (node) => [
        "div",
        {
          class: `editor-button-wrapper editor-button-${node.attrs.alignment}`,
          "data-variant": node.attrs.variant,
          "data-alignment": node.attrs.alignment,
          "data-href": sanitizeUrl(node.attrs.href),
        },
        [
          "button",
          {
            class: `editor-button editor-button-${node.attrs.variant}`,
            type: "button",
            contentEditable: "false",
          },
          node.attrs.label,
        ],
      ],
      leafText: (node) => node.attrs.label,
    };
  }

  handleSelect =
    ({ getPos }: ComponentProps) =>
    () => {
      const { view } = this.editor;
      const $pos = view.state.doc.resolve(getPos());
      const transaction = view.state.tr.setSelection(new NodeSelection($pos));
      view.dispatch(transaction);
    };

  component = (props: ComponentProps) => {
    const { isSelected, isEditable, node } = props;
    const { href, label, variant, alignment } = node.attrs as {
      href: string;
      label: string;
      variant: ButtonVariant;
      alignment: ButtonAlignment;
    };

    const handleButtonClick = (e: React.MouseEvent) => {
      if (isEditable) {
        e.preventDefault();
        e.stopPropagation();
      } else if (href) {
        window.open(sanitizeUrl(href), "_blank", "noopener,noreferrer");
      }
    };

    return (
      <ButtonWrapper
        $alignment={alignment}
        data-selected={isSelected}
        onMouseDown={this.handleSelect(props)}
      >
        <StyledButton
          type="button"
          onClick={handleButtonClick}
          data-variant={variant}
        >
          {label}
        </StyledButton>
      </ButtonWrapper>
    );
  };

  commands({ type }: { type: NodeType }) {
    return {
      createButton:
        (attrs: Record<string, Primitive>): Command =>
        (state, dispatch) => {
          dispatch?.(
            state.tr.replaceSelectionWith(type.create(attrs)).scrollIntoView()
          );
          return true;
        },
      setButtonVariant:
        (attrs: { variant: ButtonVariant }): Command =>
        (state, dispatch) => {
          if (!(state.selection instanceof NodeSelection)) {
            return false;
          }
          const { selection } = state;
          dispatch?.(
            state.tr.setNodeMarkup(selection.from, undefined, {
              ...selection.node.attrs,
              variant: attrs.variant,
            })
          );
          return true;
        },
      alignButtonLeft: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const { selection } = state;
        dispatch?.(
          state.tr.setNodeMarkup(selection.from, undefined, {
            ...selection.node.attrs,
            alignment: "left",
          })
        );
        return true;
      },
      alignButtonCenter: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const { selection } = state;
        dispatch?.(
          state.tr.setNodeMarkup(selection.from, undefined, {
            ...selection.node.attrs,
            alignment: "center",
          })
        );
        return true;
      },
      alignButtonRight: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const { selection } = state;
        dispatch?.(
          state.tr.setNodeMarkup(selection.from, undefined, {
            ...selection.node.attrs,
            alignment: "right",
          })
        );
        return true;
      },
      updateButton:
        (attrs: Partial<{ href: string; label: string }>): Command =>
        (state, dispatch) => {
          if (!(state.selection instanceof NodeSelection)) {
            return false;
          }
          const { selection } = state;
          dispatch?.(
            state.tr.setNodeMarkup(selection.from, undefined, {
              ...selection.node.attrs,
              ...attrs,
            })
          );
          return true;
        },
      deleteButton: (): Command => (state, dispatch) => {
        dispatch?.(state.tr.deleteSelection());
        return true;
      },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.ensureNewLine();
    // Custom format: [button:label:variant:alignment](href)
    state.write(
      `[button:${state.esc(node.attrs.label, false)}:${node.attrs.variant}:${node.attrs.alignment}](${state.esc(node.attrs.href, false)})`
    );
    state.write("\n\n");
  }

  parseMarkdown() {
    return {
      node: "button",
      getAttrs: (tok: { attrGet: (key: string) => string | null }) => {
        // Parse from token attributes if available
        const href = tok.attrGet("href") || "";
        const label = tok.attrGet("label") || "Button";
        const variant = tok.attrGet("variant") || "primary";
        const alignment = tok.attrGet("alignment") || "center";
        return { href, label, variant, alignment };
      },
    };
  }
}

const ButtonWrapper = styled.div<{
  $alignment: ButtonAlignment;
}>`
  display: flex;
  margin: 0.75em 0;
  user-select: none;
  justify-content: ${(props) =>
    props.$alignment === "left"
      ? "flex-start"
      : props.$alignment === "right"
        ? "flex-end"
        : "center"};

  &[data-selected="true"] {
    outline: 2px solid ${s("selected")};
    outline-offset: 2px;
    border-radius: 8px;
  }
`;

const StyledButton = styled.button`
  display: inline-block;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  text-decoration: none;
  cursor: var(--pointer);
  transition: all 150ms ease-in-out;
  border: none;

  /* Primary variant (default) */
  background: ${s("accent")};
  color: ${s("accentText")};

  &:hover {
    filter: brightness(0.9);
  }

  /* Secondary variant */
  &[data-variant="secondary"] {
    background: ${s("buttonNeutralBackground")};
    color: ${s("text")};
    box-shadow:
      rgba(0, 0, 0, 0.07) 0px 1px 2px,
      ${s("buttonNeutralBorder")} 0 0 0 1px inset;
    filter: none;

    &:hover {
      background: ${s("listItemHoverBackground")};
    }
  }

  /* Outline variant */
  &[data-variant="outline"] {
    background: transparent;
    color: ${s("accent")};
    border: 2px solid ${s("accent")};
    filter: none;

    &:hover {
      background: color-mix(in srgb, ${s("accent")} 10%, transparent);
    }
  }

  &:focus-visible {
    outline: 2px solid ${s("accent")};
    outline-offset: 2px;
  }
`;
