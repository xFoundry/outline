import {
  Plugin,
  PluginKey,
  NodeSelection,
  TextSelection,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Node as ProsemirrorNode, DOMSerializer } from "prosemirror-model";
import Extension from "@shared/editor/lib/Extension";

/**
 * Block types that should have drag handles.
 * Lists are excluded because they have their own built-in drag handles.
 */
const DRAGGABLE_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "code_fence",
  "code_block",
  "container_notice",
  "hr",
  "embed",
  "attachment",
  "video",
  "math_block",
  "table",
]);

const pluginKey = new PluginKey("block-handle");

/** SVG icon for the drag handle (6-dot grip) */
const DRAG_HANDLE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="7" width="3" height="2" rx="1"/>
  <rect x="8" y="11" width="3" height="2" rx="1"/>
  <rect x="8" y="15" width="3" height="2" rx="1"/>
  <rect x="13" y="7" width="3" height="2" rx="1"/>
  <rect x="13" y="11" width="3" height="2" rx="1"/>
  <rect x="13" y="15" width="3" height="2" rx="1"/>
</svg>`;

/**
 * Find the draggable block at a given position.
 */
function findDraggableBlockAt(
  doc: ProsemirrorNode,
  pos: number
): { node: ProsemirrorNode; pos: number } | null {
  try {
    const $pos = doc.resolve(pos);

    for (let depth = $pos.depth; depth >= 0; depth--) {
      const node = $pos.node(depth);

      if (DRAGGABLE_BLOCK_TYPES.has(node.type.name)) {
        const parentNode = depth > 0 ? $pos.node(depth - 1) : null;
        const isTopLevel = parentNode?.type.name === "doc";
        const isInColumn = parentNode?.type.name === "column";

        if (isTopLevel || isInColumn) {
          return {
            node,
            pos: $pos.before(depth),
          };
        }
      }
    }
  } catch (e) {
    // Position resolution failed
  }
  return null;
}

/**
 * BlockHandle extension adds a floating drag handle to block elements.
 *
 * Uses a single handle element that moves to follow the hovered block.
 * This is more performant than creating handles for every block.
 */
export default class BlockHandleExtension extends Extension {
  get name() {
    return "block-handle";
  }

  get plugins() {
    return [
      new Plugin({
        key: pluginKey,
        view(editorView) {
          return new BlockHandleView(editorView);
        },
        props: {
          handleDrop(view, event, _slice, _moved) {
            const dragging = (view as any).dragging;
            if (!dragging) {
              return false;
            }

            // Get drop position
            const coords = { left: event.clientX, top: event.clientY };
            const posInfo = view.posAtCoords(coords);
            if (!posInfo) {
              return false;
            }

            // Find the drop target position (between blocks)
            const $pos = view.state.doc.resolve(posInfo.pos);
            let insertPos = posInfo.pos;

            // Adjust to insert at block boundary
            if ($pos.parent.type.name !== "doc" && $pos.parent.type.name !== "column") {
              // Find the block boundary
              for (let d = $pos.depth; d > 0; d--) {
                const parent = $pos.node(d);
                if (parent.type.name === "doc" || parent.type.name === "column") {
                  insertPos = $pos.after(d + 1);
                  break;
                }
              }
            }

            // Perform the move
            const tr = view.state.tr;
            const { selection } = view.state;

            // Delete original content
            tr.delete(selection.from, selection.to);

            // Adjust insert position if it was after the deleted content
            const mappedPos = tr.mapping.map(insertPos);

            // Insert at new position
            tr.insert(mappedPos, dragging.slice.content);

            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  }
}

/**
 * Manages the floating drag handle element.
 */
class BlockHandleView {
  private view: EditorView;
  private handle: HTMLElement;
  private currentBlockPos: number | null = null;
  private isDragging = false;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(view: EditorView) {
    this.view = view;
    this.handle = this.createHandle();

    // Insert handle into editor wrapper
    view.dom.parentElement?.appendChild(this.handle);

    // Bind event handlers
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);

    view.dom.addEventListener("mousemove", this.handleMouseMove);
    view.dom.addEventListener("mouseleave", this.handleMouseLeave);
  }

  private createHandle(): HTMLElement {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "block-drag-handle";
    handle.contentEditable = "false";
    handle.draggable = true;
    handle.innerHTML = DRAG_HANDLE_ICON;
    handle.setAttribute("aria-label", "Drag to move block");
    handle.style.display = "none";

    handle.addEventListener("mousedown", this.handleMouseDown.bind(this));
    handle.addEventListener("dragstart", this.handleDragStart.bind(this));
    handle.addEventListener("dragend", this.handleDragEnd.bind(this));

    // Keep handle visible while hovering over it
    handle.addEventListener("mouseenter", () => {
      // Cancel any pending hide
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
      handle.style.opacity = "1";
    });
    handle.addEventListener("mouseleave", (e) => {
      if (!this.isDragging) {
        // Check if moving back to the editor
        const relatedTarget = e.relatedTarget as Node | null;
        if (relatedTarget && this.view.dom.contains(relatedTarget)) {
          handle.style.opacity = "0.5";
        } else {
          // Moving away from both editor and handle - hide it
          this.hideHandle();
        }
      }
    });

    return handle;
  }

  private handleMouseMove(event: MouseEvent) {
    if (!this.view.editable || this.isDragging) {
      return;
    }

    // Cancel any pending hide since mouse is back in editor
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Skip if hovering over the handle itself
    if (event.target === this.handle || this.handle.contains(event.target as Node)) {
      return;
    }

    // Skip if hovering over heading action buttons
    const target = event.target as HTMLElement;
    if (target.closest(".heading-actions")) {
      return;
    }

    // Find block at mouse position
    const coords = { left: event.clientX, top: event.clientY };
    const posInfo = this.view.posAtCoords(coords);

    if (!posInfo) {
      // Don't hide immediately - let handleMouseLeave deal with it
      return;
    }

    const result = findDraggableBlockAt(this.view.state.doc, posInfo.pos);
    if (!result) {
      // Don't hide immediately - keep handle at last position
      return;
    }

    // Position handle next to the block
    this.currentBlockPos = result.pos;
    this.positionHandle(result.pos);
  }

  private handleMouseLeave(event: MouseEvent) {
    if (!this.isDragging) {
      // Check if mouse is moving to the handle
      const relatedTarget = event.relatedTarget as Node | null;
      if (relatedTarget === this.handle || this.handle.contains(relatedTarget)) {
        return; // Moving to handle, don't hide
      }
      // Delay hiding to give time to reach the handle
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
      }
      this.hideTimeout = setTimeout(() => {
        this.hideHandle();
        this.hideTimeout = null;
      }, 200);
    }
  }

  private positionHandle(pos: number) {
    try {
      const blockDom = this.view.nodeDOM(pos);
      if (!(blockDom instanceof HTMLElement)) {
        this.hideHandle();
        return;
      }

      const blockRect = blockDom.getBoundingClientRect();
      const editorRect = this.view.dom.getBoundingClientRect();
      const wrapperRect = this.view.dom.parentElement?.getBoundingClientRect();

      if (!wrapperRect) {
        this.hideHandle();
        return;
      }

      // Check for RTL layout
      const isRTL = getComputedStyle(this.view.dom).direction === "rtl";

      // Position handle to the left of the block (or right in RTL)
      this.handle.style.display = "flex";
      this.handle.style.position = "absolute";
      this.handle.style.top = `${blockRect.top - wrapperRect.top}px`;

      if (isRTL) {
        this.handle.style.left = "auto";
        this.handle.style.right = `${wrapperRect.right - editorRect.right - 32}px`;
      } else {
        this.handle.style.right = "auto";
        this.handle.style.left = `${editorRect.left - wrapperRect.left - 32}px`;
      }

      this.handle.style.opacity = "0.5";
    } catch (e) {
      this.hideHandle();
    }
  }

  private hideHandle() {
    this.handle.style.display = "none";
    this.currentBlockPos = null;
  }

  private handleMouseDown(event: MouseEvent) {
    // Don't prevent default - needed for drag to initiate
    event.stopPropagation();

    if (this.currentBlockPos === null) {
      return;
    }

    const node = this.view.state.doc.nodeAt(this.currentBlockPos);
    if (!node) {
      return;
    }

    // Select the entire block - use NodeSelection if possible
    try {
      const selection = NodeSelection.create(this.view.state.doc, this.currentBlockPos);
      const tr = this.view.state.tr.setSelection(selection);
      this.view.dispatch(tr);
    } catch {
      // NodeSelection not supported - select content inside the block
      // Position inside block content is currentBlockPos + 1
      const $start = this.view.state.doc.resolve(this.currentBlockPos + 1);
      const $end = this.view.state.doc.resolve(this.currentBlockPos + node.nodeSize - 1);
      const tr = this.view.state.tr.setSelection(
        TextSelection.between($start, $end)
      );
      this.view.dispatch(tr);
    }
  }

  private handleDragStart(event: DragEvent) {
    if (this.currentBlockPos === null) {
      event.preventDefault();
      return;
    }

    const node = this.view.state.doc.nodeAt(this.currentBlockPos);
    if (!node) {
      event.preventDefault();
      return;
    }

    this.isDragging = true;
    this.handle.style.opacity = "1";

    // Create slice from the block node
    const from = this.currentBlockPos;
    const to = from + node.nodeSize;
    const slice = this.view.state.doc.slice(from, to);

    // Set view.dragging so ProseMirror handles the drop
    (this.view as any).dragging = {
      slice,
      move: true,
    };

    // Create drag image
    const serializer = DOMSerializer.fromSchema(this.view.state.schema);
    const dom = serializer.serializeNode(node);

    if (dom instanceof HTMLElement && event.dataTransfer) {
      dom.style.position = "absolute";
      dom.style.top = "-10000px";
      dom.style.maxWidth = "400px";
      dom.style.padding = "8px";
      dom.style.background = "#fff";
      dom.style.borderRadius = "4px";
      dom.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
      document.body.appendChild(dom);
      event.dataTransfer.setDragImage(dom, 0, 0);
      setTimeout(() => dom.remove(), 0);

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/html", dom.outerHTML);
      event.dataTransfer.setData("text/plain", node.textContent);
    }
  }

  private handleDragEnd() {
    this.isDragging = false;
    (this.view as any).dragging = null;
    this.hideHandle();
  }

  update() {
    // Handle is repositioned on mouse move, nothing to do here
  }

  destroy() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    this.view.dom.removeEventListener("mousemove", this.handleMouseMove);
    this.view.dom.removeEventListener("mouseleave", this.handleMouseLeave);
    this.handle.remove();
  }
}
