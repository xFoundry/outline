import type { Token } from "markdown-it";
import type {
  NodeSpec,
  NodeType,
  Node as ProsemirrorNode,
} from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { NodeSelection, TextSelection } from "prosemirror-state";
import * as React from "react";
import type { Primitive } from "utility-types";
import { sanitizeUrl } from "../../utils/urls";
import toggleWrap from "../commands/toggleWrap";
import Caption from "../components/Caption";
import VideoComponent from "../components/Video";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import attachmentsRule from "../rules/links";
import type { ComponentProps } from "../types";
import Node from "./Node";

export default class Video extends Node {
  get name() {
    return "video";
  }

  get rulePlugins() {
    return [attachmentsRule];
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        id: {
          default: null,
        },
        src: {
          default: null,
        },
        width: {
          default: null,
        },
        height: {
          default: null,
        },
        title: {
          default: null,
          validate: "string|null",
        },
        layoutClass: {
          default: null,
          validate: "string|null",
        },
      },
      group: "block",
      selectable: true,
      // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1289000
      draggable: false,
      defining: true,
      atom: true,
      parseDOM: [
        {
          priority: 100,
          tag: "div.video",
          getAttrs: (dom: HTMLDivElement) => {
            const className = dom.className;
            const layoutClassMatch = className.match(
              /video-(left-50|right-50|full-width)/
            );
            const layoutClass = layoutClassMatch ? layoutClassMatch[1] : null;
            const video = dom.querySelector("video");

            return {
              id: video?.id,
              title: video?.getAttribute("title"),
              src: video?.getAttribute("src"),
              width: parseInt(video?.getAttribute("width") ?? "", 10),
              height: parseInt(video?.getAttribute("height") ?? "", 10),
              layoutClass,
            };
          },
        },
        {
          priority: 100,
          tag: "video",
          getAttrs: (dom: HTMLVideoElement) => ({
            id: dom.id,
            title: dom.getAttribute("title"),
            src: dom.getAttribute("src"),
            width: parseInt(dom.getAttribute("width") ?? "", 10),
            height: parseInt(dom.getAttribute("height") ?? "", 10),
          }),
        },
      ],
      toDOM: (node) => {
        const className = node.attrs.layoutClass
          ? `video video-${node.attrs.layoutClass}`
          : "video";

        return [
          "div",
          {
            class: className,
          },
          [
            "video",
            {
              id: node.attrs.id,
              src: sanitizeUrl(node.attrs.src),
              controls: true,
              width: node.attrs.width,
              height: node.attrs.height,
            },
            String(node.attrs.title),
          ],
        ];
      },
      leafText: (node) => node.attrs.title,
    };
  }

  handleSelect =
    ({ getPos }: { getPos: () => number }) =>
    () => {
      const { view } = this.editor;
      const $pos = view.state.doc.resolve(getPos());
      const transaction = view.state.tr.setSelection(new NodeSelection($pos));
      view.dispatch(transaction);
    };

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

  handleCaptionKeyDown =
    ({ node, getPos }: { node: ProsemirrorNode; getPos: () => number }) =>
    (event: React.KeyboardEvent<HTMLParagraphElement>) => {
      // Pressing Enter in the caption field should move the cursor/selection
      // below the video
      if (event.key === "Enter") {
        event.preventDefault();

        const { view } = this.editor;
        const $pos = view.state.doc.resolve(getPos() + node.nodeSize);
        view.dispatch(
          view.state.tr.setSelection(TextSelection.near($pos)).scrollIntoView()
        );
        view.focus();
        return;
      }

      // Pressing Backspace in an empty caption field focuses the video.
      if (event.key === "Backspace" && event.currentTarget.innerText === "") {
        event.preventDefault();
        event.stopPropagation();
        const { view } = this.editor;
        const $pos = view.state.doc.resolve(getPos());
        const tr = view.state.tr.setSelection(new NodeSelection($pos));
        view.dispatch(tr);
        view.focus();
        return;
      }
    };

  handleCaptionBlur =
    ({ node, getPos }: { node: ProsemirrorNode; getPos: () => number }) =>
    (event: React.FocusEvent<HTMLParagraphElement>) => {
      const caption = event.currentTarget.innerText;
      if (caption === node.attrs.title) {
        return;
      }

      const { view } = this.editor;
      const { tr } = view.state;

      // update meta on object
      const pos = getPos();
      const transaction = tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        title: caption,
      });
      view.dispatch(transaction);
    };

  component = (props: ComponentProps) => (
    <VideoComponent {...props} onChangeSize={this.handleChangeSize(props)}>
      <Caption
        width={props.node.attrs.width}
        onBlur={this.handleCaptionBlur(props)}
        onKeyDown={this.handleCaptionKeyDown(props)}
        isSelected={props.isSelected}
        placeholder={this.options.dictionary.imageCaptionPlaceholder}
      >
        {props.node.attrs.title}
      </Caption>
    </VideoComponent>
  );

  commands({ type }: { type: NodeType }) {
    return {
      video: (attrs: Record<string, Primitive>) => toggleWrap(type, attrs),
      alignVideoLeft: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }

        dispatch?.(
          state.tr.setNodeMarkup(state.selection.from, undefined, {
            ...state.selection.node.attrs,
            layoutClass: "left-50",
          })
        );
        return true;
      },
      alignVideoCenter: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }

        dispatch?.(
          state.tr.setNodeMarkup(state.selection.from, undefined, {
            ...state.selection.node.attrs,
            layoutClass: null,
          })
        );
        return true;
      },
      alignVideoRight: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }

        dispatch?.(
          state.tr.setNodeMarkup(state.selection.from, undefined, {
            ...state.selection.node.attrs,
            layoutClass: "right-50",
          })
        );
        return true;
      },
      alignVideoFullWidth: (): Command => (state, dispatch) => {
        if (!(state.selection instanceof NodeSelection)) {
          return false;
        }

        const layoutClass =
          state.selection.node.attrs.layoutClass === "full-width"
            ? null
            : "full-width";

        dispatch?.(
          state.tr.setNodeMarkup(state.selection.from, undefined, {
            ...state.selection.node.attrs,
            layoutClass,
          })
        );
        return true;
      },
      deleteVideo: (): Command => (state, dispatch) => {
        dispatch?.(state.tr.deleteSelection());
        return true;
      },
      resizeVideo:
        ({ width, height }: { width: number; height: number }): Command =>
        (state, dispatch) => {
          if (!(state.selection instanceof NodeSelection)) {
            return false;
          }

          const { selection } = state;
          const transformedAttrs = {
            ...state.selection.node.attrs,
            width,
            height,
          };

          const tr = state.tr
            .setNodeMarkup(selection.from, undefined, transformedAttrs)
            .setMeta("addToHistory", true);

          const $pos = tr.doc.resolve(selection.from);
          dispatch?.(tr.setSelection(new NodeSelection($pos)));
          return true;
        },
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.ensureNewLine();
    state.write(
      `[${node.attrs.title} ${node.attrs.width}x${node.attrs.height}](${node.attrs.src})\n\n`
    );
    state.ensureNewLine();
  }

  parseMarkdown() {
    return {
      node: "video",
      getAttrs: (tok: Token) => ({
        src: tok.attrGet("src"),
        title: tok.attrGet("title"),
        width: parseInt(tok.attrGet("width") ?? "", 10),
        height: parseInt(tok.attrGet("height") ?? "", 10),
      }),
    };
  }
}
