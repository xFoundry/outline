import { Command } from "prosemirror-state";
import Extension, { CommandFactory } from "../lib/Extension";

export type AIEditOperation =
  | "rephrase"
  | "expand"
  | "simplify"
  | "fixGrammar"
  | "translate"
  | "summarize"
  | "custom";

export interface AIEditOptions {
  operation: AIEditOperation;
  customPrompt?: string;
  targetLanguage?: string;
}

/**
 * AIEditor extension provides AI-powered text editing capabilities.
 * Commands can be invoked from the selection toolbar or via keyboard shortcuts.
 */
export default class AIEditor extends Extension {
  get name() {
    return "ai_editor";
  }

  commands(): Record<string, CommandFactory> {
    return {
      aiRephrase: () => this.createAICommand("rephrase"),
      aiExpand: () => this.createAICommand("expand"),
      aiSimplify: () => this.createAICommand("simplify"),
      aiFixGrammar: () => this.createAICommand("fixGrammar"),
      aiSummarize: () => this.createAICommand("summarize"),
      aiTranslate: (attrs?: { language?: string }) =>
        this.createAICommand("translate", { targetLanguage: attrs?.language }),
      aiCustomPrompt: (attrs?: { prompt?: string }) =>
        this.createAICommand("custom", { customPrompt: attrs?.prompt }),
    };
  }

  keys(): Record<string, Command | CommandFactory> {
    return {
      // Mod-Shift-A opens the AI menu (handled in toolbar)
      "Mod-Shift-a": () => {
        // This is a placeholder - the actual AI menu is shown via the toolbar
        // The command returns false to indicate it didn't handle the key
        return false;
      },
    };
  }

  private createAICommand(
    operation: AIEditOperation,
    options: Partial<AIEditOptions> = {}
  ): Command {
    return (state, dispatch) => {
      const { selection } = state;
      const { from, to } = selection;

      // For most operations, we need a selection
      if (from === to && operation !== "custom") {
        return false;
      }

      // Get the selected text
      const selectedText = state.doc.textBetween(from, to, " ");

      if (!selectedText.trim() && operation !== "custom") {
        return false;
      }

      // Dispatch a custom event that the editor can handle
      // The actual AI processing is done in the frontend
      if (dispatch) {
        const event = new CustomEvent("ai-edit-request", {
          detail: {
            operation,
            selectedText,
            from,
            to,
            ...options,
          },
          bubbles: true,
        });

        // The editor view's dom element will receive this event
        this.editor.view.dom.dispatchEvent(event);
      }

      return true;
    };
  }
}
