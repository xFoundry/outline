import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import { Command, NodeSelection } from "prosemirror-state";
import * as React from "react";
import styled from "styled-components";
import { Primitive } from "utility-types";
import { sanitizeUrl } from "../../utils/urls";
import toggleWrap from "../commands/toggleWrap";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import { ComponentProps } from "../types";
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
            const link = dom.querySelector("a");
            return {
              href: link?.getAttribute("href") || "",
              label: link?.textContent || "Button",
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
        },
        [
          "a",
          {
            class: `editor-button editor-button-${node.attrs.variant}`,
            href: sanitizeUrl(node.attrs.href),
            role: "button",
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
    const { isSelected, isEditable, theme, node } = props;
    const { href, label, variant, alignment } = node.attrs as {
      href: string;
      label: string;
      variant: ButtonVariant;
      alignment: ButtonAlignment;
    };

    const handleClick = (e: React.MouseEvent) => {
      if (isEditable) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    return (
      <ButtonWrapper
        $alignment={alignment}
        $isSelected={isSelected}
        onMouseDown={this.handleSelect(props)}
      >
        <StyledButton
          as="a"
          href={sanitizeUrl(href)}
          onClick={handleClick}
          $variant={variant}
          $theme={theme}
          target="_blank"
          rel="noopener noreferrer"
          role="button"
        >
          {label}
        </StyledButton>
      </ButtonWrapper>
    );
  };

  commands({ type }: { type: NodeType }) {
    return {
      createButton: (attrs: Record<string, Primitive>) =>
        toggleWrap(type, attrs),
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
  $isSelected: boolean;
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

  ${(props) =>
    props.$isSelected &&
    `
    outline: 2px solid ${props.theme.selected};
    outline-offset: 2px;
    border-radius: 8px;
  `}
`;

const StyledButton = styled.a<{
  $variant: ButtonVariant;
  $theme: ComponentProps["theme"];
}>`
  display: inline-block;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  cursor: var(--pointer);
  transition: all 150ms ease-in-out;
  border: none;

  ${(props) => {
    switch (props.$variant) {
      case "secondary":
        return `
          background: ${props.$theme.buttonNeutralBackground};
          color: ${props.$theme.text};
          box-shadow: rgba(0, 0, 0, 0.07) 0px 1px 2px,
                      ${props.$theme.buttonNeutralBorder} 0 0 0 1px inset;
          &:hover {
            background: ${props.$theme.listItemHoverBackground};
          }
        `;
      case "outline":
        return `
          background: transparent;
          color: ${props.$theme.accent};
          border: 2px solid ${props.$theme.accent};
          &:hover {
            background: ${props.$theme.accent}11;
          }
        `;
      case "primary":
      default:
        return `
          background: ${props.$theme.accent};
          color: ${props.$theme.accentText};
          &:hover {
            filter: brightness(0.9);
          }
        `;
    }
  }}

  &:focus-visible {
    outline: 2px solid ${(props) => props.$theme.accent};
    outline-offset: 2px;
  }
`;
