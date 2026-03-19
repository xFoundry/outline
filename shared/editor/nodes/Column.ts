import { NodeSpec, Node as ProsemirrorNode } from "prosemirror-model";
import { MarkdownSerializerState } from "../lib/markdown/serializer";
import Node from "./Node";

export default class Column extends Node {
    get name() {
        return "column";
    }

    get schema(): NodeSpec {
        return {
            // Columns contain at least one block
            content: "block+",
            // It is part of the layout but strictly inside multi_column
            isolating: true,
            parseDOM: [
                {
                    tag: "div.column",
                },
            ],
            toDOM: () => ["div", { class: "column" }, 0],
        };
    }

    toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
        state.ensureNewLine();
        state.renderContent(node);
    }

    parseMarkdown() {
        return { block: "column", getAttrs: (tok: any) => ({ class: "column" }) };
    }
}
