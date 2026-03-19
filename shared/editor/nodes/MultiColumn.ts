import { NodeSpec, Node as ProsemirrorNode } from "prosemirror-model";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import Node from "./Node";

export default class MultiColumn extends Node {
    get name() {
        return "multi_column";
    }

    get schema(): NodeSpec {
        return {
            content: "column{2,}",
            group: "block",
            defining: true,
            isolating: true,
            parseDOM: [
                {
                    tag: "div.multi-column",
                },
            ],
            toDOM: () => ["div", { class: "multi-column" }, 0],
        };
    }

    toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
        state.ensureNewLine();
        // Markdown support for columns is tricky. usage of HTML or generic container is needed.
        // For now, we render content sequentially or wrap in logic if needed.
        // As a simple fallback, we just render content. 
        // Ideally we should have a custom markdown syntax or just treat it as blocks.
        state.renderContent(node);
    }

    parseMarkdown() {
        // Parsing columns from standard markdown is not standard.
        // We might skip markdown parsing for now or assume specific HTML.
        return { block: "multi_column", getAttrs: (tok: any) => ({ class: "multi-column" }) };
    }
}
