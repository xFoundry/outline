import { Token } from "markdown-it";
import { NodeSpec, NodeType, Node as ProsemirrorNode } from "prosemirror-model";
import { Command, NodeSelection } from "prosemirror-state";
import * as React from "react";
import { Primitive } from "utility-types";
import { sanitizeUrl } from "../../utils/urls";
import EmbedComponent from "../components/Embed";
import defaultEmbeds from "../embeds";
import { getMatchingEmbed } from "../lib/embeds";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import embedsRule from "../rules/embeds";
import { ComponentProps } from "../types";
import Node from "./Node";

export default class Embed extends Node {
  get name() {
    return "embed";
  }

  get schema(): NodeSpec {
    return {
      content: "inline*",
      group: "block",
      atom: true,
      draggable: true,
      attrs: {
        href: {
          validate: "string",
        },
        width: {
          default: null,
        },
        height: {
          default: null,
        },
        layoutClass: {
          default: null,
          validate: "string|null",
        },
      },
      parseDOM: [
        {
          tag: "div.embed-wrapper",
          getAttrs: (dom: HTMLDivElement) => {
            const className = dom.className;
            const layoutClassMatch = className.match(
              /embed-(left-50|right-50|full-width)/
            );
            const layoutClass = layoutClassMatch ? layoutClassMatch[1] : null;
            const iframe = dom.querySelector("iframe");
            const link = dom.querySelector("a");
            const href =
              iframe?.getAttribute("data-canonical-url") ||
              link?.getAttribute("href") ||
              "";
            return { href, layoutClass };
          },
        },
        {
          tag: "iframe",
          getAttrs: (dom: HTMLIFrameElement) => {
            const embeds = this.editor?.props.embeds ?? defaultEmbeds;
            const href = dom.getAttribute("data-canonical-url") || "";
            const response = getMatchingEmbed(embeds, href);

            if (response) {
              return {
                href,
              };
            }

            return false;
          },
        },
        {
          tag: "a.embed",
          getAttrs: (dom: HTMLAnchorElement) => ({
            href: dom.getAttribute("href"),
          }),
        },
      ],
      toDOM: (node) => {
        const embeds = this.editor?.props.embeds ?? defaultEmbeds;
        const response = getMatchingEmbed(embeds, node.attrs.href);
        const src = response?.embed.transformMatch?.(response.matches);
        const wrapperClass = node.attrs.layoutClass
          ? `embed-wrapper embed-${node.attrs.layoutClass}`
          : "embed-wrapper";

        if (src) {
          return [
            "div",
            { class: wrapperClass },
            [
              "iframe",
              {
                class: "embed",
                frameborder: "0",
                src: sanitizeUrl(src),
                contentEditable: "false",
                allowfullscreen: "true",
                "data-canonical-url": sanitizeUrl(node.attrs.href),
              },
            ],
          ];
        } else {
          return [
            "div",
            { class: wrapperClass },
            [
              "a",
              {
                class: "embed",
                href: sanitizeUrl(node.attrs.href),
                contentEditable: "false",
                "data-canonical-url": sanitizeUrl(node.attrs.href),
              },
              response?.embed.title ?? node.attrs.href,
            ],
          ];
        }
      },
      leafText: (node) => node.attrs.href,
    };
  }

  get rulePlugins() {
    return [embedsRule(this.options.embeds)];
  }

  handleChangeSize =
    ({ node, getPos }: { node: ProsemirrorNode; getPos: () => number }) =>
    ({ width, height }: { width: number; height?: number }) => {
      const { view } = this.editor;
      const { tr } = view.state;

      const pos = getPos();
      const transaction = tr
        .setNodeMarkup(pos, undefined, {
          ...node.attrs,
          width,
          height,
        })
        .setMeta("addToHistory", true);
      const $pos = transaction.doc.resolve(getPos());
      view.dispatch(transaction.setSelection(new NodeSelection($pos)));
    };

  component = (props: ComponentProps) => {
    const { embeds, embedsDisabled } = this.editor.props;

    return (
      <EmbedComponent
        {...props}
        embeds={embeds}
        embedsDisabled={embedsDisabled}
        onChangeSize={this.handleChangeSize(props)}
      />
    );
  };

  commands({ type }: { type: NodeType }) {
    return {
      embed:
        (attrs: Record<string, Primitive>): Command =>
        (state, dispatch) => {
          dispatch?.(
            state.tr.replaceSelectionWith(type.create(attrs)).scrollIntoView()
          );
          return true;
        },
      alignEmbedLeft: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const { selection } = state;
        dispatch?.(
          state.tr.setNodeMarkup(selection.from, undefined, {
            ...selection.node.attrs,
            layoutClass: "left-50",
          })
        );
        return true;
      },
      alignEmbedCenter: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const { selection } = state;
        dispatch?.(
          state.tr.setNodeMarkup(selection.from, undefined, {
            ...selection.node.attrs,
            layoutClass: null,
          })
        );
        return true;
      },
      alignEmbedRight: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const { selection } = state;
        dispatch?.(
          state.tr.setNodeMarkup(selection.from, undefined, {
            ...selection.node.attrs,
            layoutClass: "right-50",
          })
        );
        return true;
      },
      alignEmbedFullWidth: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }
        const { selection } = state;
        let layoutClass: string | null = "full-width";
        if (selection.node.attrs.layoutClass === layoutClass) {
          layoutClass = null;
        }
        dispatch?.(
          state.tr.setNodeMarkup(selection.from, undefined, {
            ...selection.node.attrs,
            layoutClass,
          })
        );
        return true;
      },
      deleteEmbed: (): Command => (state, dispatch) => {
        dispatch?.(state.tr.deleteSelection());
        return true;
      },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    if (!state.inTable) {
      state.ensureNewLine();
    }

    const href = node.attrs.href.replace(/_/g, "%5F");

    state.write(
      "[" + state.esc(href, false) + "](" + state.esc(href, false) + ")"
    );
    if (!state.inTable) {
      state.write("\n\n");
    }
  }

  parseMarkdown() {
    return {
      node: "embed",
      getAttrs: (token: Token) => ({
        href: token.attrGet("href"),
      }),
    };
  }
}
