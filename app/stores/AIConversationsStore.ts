import invariant from "invariant";
import orderBy from "lodash/orderBy";
import { action, computed, observable, runInAction } from "mobx";
import { getCookie } from "tiny-cookie";
import { CSRF } from "@shared/constants";
import { AIProvider, AIOperationType, AIMessageRole } from "@shared/types";
import AIConversation from "~/models/AIConversation";
import { client } from "~/utils/ApiClient";
import RootStore from "./RootStore";
import Store from "./base/Store";

export type SSEEvent = {
  event: string;
  data: unknown;
};

export default class AIConversationsStore extends Store<AIConversation> {
  @observable
  activeConversationId: string | null = null;

  @observable
  isStreamingChat: boolean = false;

  @observable
  isStreamingEdit: boolean = false;

  @observable
  currentStreamedContent: string = "";

  private abortController: AbortController | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, AIConversation);
    this.apiEndpoint = "ai.conversations";
  }

  @computed
  get orderedData(): AIConversation[] {
    return orderBy(
      Array.from(this.data.values()),
      (c) => c.lastMessageAt || c.createdAt,
      "desc"
    );
  }

  @computed
  get activeConversation(): AIConversation | undefined {
    return this.activeConversationId
      ? this.data.get(this.activeConversationId)
      : undefined;
  }

  /**
   * Get conversations for a specific document.
   */
  forDocument(documentId: string): AIConversation[] {
    return this.orderedData.filter((c) => c.documentId === documentId);
  }

  /**
   * Set the active conversation.
   */
  @action
  setActiveConversation(conversationId: string | null): void {
    this.activeConversationId = conversationId;
  }

  /**
   * Fetch conversations list.
   */
  @action
  async fetchConversations(options?: {
    documentId?: string;
    limit?: number;
    offset?: number;
  }): Promise<AIConversation[]> {
    this.isFetching = true;

    try {
      const res = await client.post("/ai.conversations.list", {
        documentId: options?.documentId,
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0,
      });

      invariant(res?.data, "Data not available");

      runInAction(() => {
        res.data.forEach((item: Partial<AIConversation>) => {
          this.add(item as AIConversation);
        });
        this.isLoaded = true;
      });

      return res.data.map((item: { id: string }) =>
        this.data.get(item.id)
      ) as AIConversation[];
    } finally {
      runInAction(() => {
        this.isFetching = false;
      });
    }
  }

  /**
   * Fetch a single conversation with messages.
   */
  @action
  async fetchConversation(id: string): Promise<AIConversation | undefined> {
    this.isFetching = true;

    try {
      const res = await client.post("/ai.conversations.info", {
        id,
        includeMessages: true,
      });

      invariant(res?.data, "Data not available");

      runInAction(() => {
        this.add(res.data);
      });

      return this.data.get(id);
    } finally {
      runInAction(() => {
        this.isFetching = false;
      });
    }
  }

  /**
   * Delete a conversation.
   */
  @action
  async deleteConversation(id: string): Promise<void> {
    const conversation = this.data.get(id);

    // Optimistic delete
    if (conversation) {
      this.data.delete(id);
    }

    try {
      await client.post("/ai.conversations.delete", { id });

      if (this.activeConversationId === id) {
        this.activeConversationId = null;
      }
    } catch (error) {
      // Restore on error
      if (conversation) {
        this.data.set(id, conversation);
      }
      throw error;
    }
  }

  /**
   * Send a chat message and stream the response.
   */
  @action
  async sendChatMessage(options: {
    message: string;
    conversationId?: string;
    documentId?: string;
    model?: string;
    provider?: AIProvider;
    onToken?: (token: string) => void;
    onFinish?: (text: string) => void;
    onError?: (error: Error) => void;
  }): Promise<void> {
    // Cancel any existing stream
    this.cancelStream();

    this.isStreamingChat = true;
    this.currentStreamedContent = "";
    this.abortController = new AbortController();

    // Create optimistic user message in conversation
    let conversation = options.conversationId
      ? this.data.get(options.conversationId)
      : undefined;

    if (conversation) {
      conversation.addMessage({
        role: AIMessageRole.User,
        content: options.message,
        createdAt: new Date().toISOString(),
      });
      conversation.startStreaming();
    }

    try {
      const csrfToken = getCookie(CSRF.cookieName);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrfToken) {
        headers[CSRF.headerName] = csrfToken;
      }

      const response = await fetch("/api/ai.chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: options.message,
          conversationId: options.conversationId,
          documentId: options.documentId,
          model: options.model,
          provider: options.provider,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent: string | null = null;
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              this.handleSSEEvent(currentEvent, data, conversation, options);
            } catch {
              // Ignore parse errors
            }
            currentEvent = null;
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        // Stream was cancelled
        conversation?.cancelStreaming();
      } else {
        options.onError?.(error as Error);
        conversation?.cancelStreaming();
      }
    } finally {
      runInAction(() => {
        this.isStreamingChat = false;
        this.abortController = null;
      });
    }
  }

  /**
   * Send an edit request and stream the response.
   */
  @action
  async sendEditRequest(options: {
    content: string;
    instruction: string;
    operation: AIOperationType;
    model?: string;
    provider?: AIProvider;
    onToken?: (token: string) => void;
    onFinish?: (text: string) => void;
    onError?: (error: Error) => void;
  }): Promise<void> {
    // Cancel any existing stream
    this.cancelStream();

    this.isStreamingEdit = true;
    this.currentStreamedContent = "";
    this.abortController = new AbortController();

    try {
      const csrfToken = getCookie(CSRF.cookieName);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrfToken) {
        headers[CSRF.headerName] = csrfToken;
      }

      const response = await fetch("/api/ai.edit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: options.content,
          instruction: options.instruction,
          operation: options.operation,
          model: options.model,
          provider: options.provider,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent: string | null = null;
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === "token" && data.token) {
                fullText += data.token;
                runInAction(() => {
                  this.currentStreamedContent = fullText;
                });
                options.onToken?.(data.token);
              } else if (currentEvent === "finish") {
                options.onFinish?.(data.text || fullText);
              } else if (currentEvent === "error") {
                options.onError?.(new Error(data.message));
              }
            } catch {
              // Ignore parse errors
            }
            currentEvent = null;
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        options.onError?.(error as Error);
      }
    } finally {
      runInAction(() => {
        this.isStreamingEdit = false;
        this.abortController = null;
      });
    }
  }

  /**
   * Cancel the current stream.
   */
  @action
  cancelStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isStreamingChat = false;
    this.isStreamingEdit = false;
    this.currentStreamedContent = "";

    if (this.activeConversation?.isStreaming) {
      this.activeConversation.cancelStreaming();
    }
  }

  private handleSSEEvent(
    eventType: string,
    data: Record<string, unknown>,
    conversation: AIConversation | undefined,
    options: {
      onToken?: (token: string) => void;
      onFinish?: (text: string) => void;
      onError?: (error: Error) => void;
    }
  ): void {
    switch (eventType) {
      case "token":
        if (data.token) {
          runInAction(() => {
            this.currentStreamedContent += data.token as string;
            conversation?.appendStreamedContent(data.token as string);
          });
          options.onToken?.(data.token as string);
        }
        break;

      case "finish":
        runInAction(() => {
          conversation?.finishStreaming();
        });
        options.onFinish?.((data.text as string) || this.currentStreamedContent);
        break;

      case "error":
        options.onError?.(new Error(data.message as string));
        conversation?.cancelStreaming();
        break;
    }
  }
}
