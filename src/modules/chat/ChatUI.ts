import { AGYClient } from "../api/AGYClient";
import { ChatManager } from "./ChatManager";
import { ContextManager } from "../context/ContextManager";
import { NoteWriter } from "../notes/NoteWriter";
import { OAuthManager } from "../auth/OAuthManager";

export class ChatUI {
  /** Handle incoming messages from the sidebar HTML */
  static async handleMessage(event: any): Promise<void> {
    const data = event.data;
    if (!data || !data.type) return;

    try {
      switch (data.type) {
        case "login":
          await OAuthManager.login();
          break;
        case "logout":
          OAuthManager.logout();
          break;
        case "send-message": {
          const text =
            data.content || data.data?.text || data.data?.content || "";
          if (text) await ChatUI.handleUserMessage(text);
          break;
        }
        case "remove-context": {
          const id = data.id || data.data?.id;
          if (id) ContextManager.removeContext(id);
          break;
        }
        case "save-to-note": {
          const content = data.content || data.data?.content || "";
          if (content)
            await ChatUI.handleSaveNote(
              data.messageId || data.data?.messageId,
              content,
            );
          break;
        }
        case "new-conversation":
          ChatManager.createConversation();
          ChatUI.sendToSidebar({
            type: "load-conversation",
            messages: [],
            data: { messages: [] },
          });
          break;
        case "open-settings":
          // @ts-ignore
          Zotero.openPreferences?.(`${addon.data.config.addonRef}-preferences`);
          break;
      }
    } catch (e) {
      ztoolkit.log("Error handling sidebar message", e);
      ChatUI.sendToSidebar({ type: "system-message", message: `错误: ${e}` });
    }
  }

  private static async handleUserMessage(text: string): Promise<void> {
    const contexts = [...ContextManager.getContexts()];

    // Add user message to history
    const userMsg = ChatManager.addMessage("user", text, contexts);

    // Send back to UI immediately
    ChatUI.sendToSidebar({
      type: "message-added",
      message: userMsg,
      data: userMsg,
    });

    // Format the prompt
    let fullPrompt = text;
    const contextText = ContextManager.formatContextsForPrompt();
    if (contextText) {
      fullPrompt = `[Context Data]\n${contextText}\n\n[User Request]\n${text}`;
    }

    const conversation = ChatManager.getActiveConversation();
    const history =
      conversation?.messages.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content,
      })) || [];

    history.push({ role: "user", content: fullPrompt });

    // Generate response ID
    const responseId =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    try {
      // Start streaming response
      const result = await AGYClient.sendMessageStream(
        fullPrompt,
        (chunk, done) => {
          ChatUI.sendToSidebar({
            type: "stream-chunk",
            chunk,
            text: chunk,
            done,
            data: { messageId: responseId, text: chunk, done },
          });
        },
        conversation?.agyConversationId,
      );

      if (result.agyConversationId && conversation) {
        ChatManager.setAgyConversationId(
          conversation.id,
          result.agyConversationId,
        );
      }

      // Save full response to history once done
      ChatManager.addMessage("assistant", result.response);
    } catch (e: any) {
      // Handle error
      ChatUI.sendToSidebar({
        type: "stream-chunk",
        chunk: `\n\n**[Error]** ${e.message}`,
        text: `\n\n**[Error]** ${e.message}`,
        done: true,
        data: {
          messageId: responseId,
          text: `**[Error]** ${e.message}`,
          done: true,
        },
      });
      ChatManager.addMessage("system", `Error: ${e.message}`);
    }
  }

  private static async handleSaveNote(
    messageId: string,
    content: string,
  ): Promise<void> {
    const selectedItems = Zotero.getActiveZoteroPane()?.getSelectedItems();
    if (!selectedItems || selectedItems.length === 0) {
      new ztoolkit.ProgressWindow(addon.data.config.addonName)
        .createLine({
          text: "请先在列表中选中一个条目来保存笔记",
          type: "error",
          progress: 100,
        })
        .show(-1);
      return;
    }

    const parentItem = selectedItems[0];
    if (parentItem.isNote()) {
      await NoteWriter.appendToNote(parentItem.id, content);
    } else {
      await NoteWriter.saveResponseAsNote(
        parentItem.id,
        "Chat Response",
        content,
      );
    }
  }

  static sendToSidebar(message: any): void {
    if (addon.data.sidebar.browser?.contentWindow) {
      addon.data.sidebar.browser.contentWindow.postMessage(message, "*");
    }
  }
}
