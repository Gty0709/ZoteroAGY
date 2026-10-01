import { ContextItem } from '../../addon';
import { NoteFormatter } from './NoteFormatter';

export class NoteWriter {
  /** Save AI response as a child note */
  static async saveResponseAsNote(
    itemId: number, question: string, answer: string, contexts?: ContextItem[]
  ): Promise<Zotero.Item> {
    const parentItem = await Zotero.Items.getAsync(itemId) as Zotero.Item;
    const note = new Zotero.Item('note');
    note.libraryID = parentItem.libraryID;
    note.parentID = parentItem.id;
    const html = NoteFormatter.createNoteHTML(question, answer, contexts);
    note.setNote(html);
    await note.saveTx();
    new ztoolkit.ProgressWindow(addon.data.config.addonName)
      .createLine({ text: 'AI 回答已保存到笔记', type: 'success', progress: 100 }).show(-1);
    return note;
  }

  /** Append to existing note */
  static async appendToNote(noteId: number, content: string): Promise<void> {
    const note = await Zotero.Items.getAsync(noteId) as Zotero.Item;
    if (!note || !note.isNote()) return;
    const existing = note.getNote();
    note.setNote(existing + '<hr/>' + content);
    await note.saveTx();
  }

  /** Export conversation as note */
  static async exportConversation(
    conversation: { messages: Array<{ role: string; content: string; timestamp: number; contexts?: ContextItem[] }> },
    parentItemId: number
  ): Promise<Zotero.Item> {
    const parentItem = await Zotero.Items.getAsync(parentItemId) as Zotero.Item;
    const note = new Zotero.Item('note');
    note.libraryID = parentItem.libraryID;
    note.parentID = parentItem.id;
    const html = NoteFormatter.createConversationHTML(conversation.messages);
    note.setNote(html);
    await note.saveTx();
    return note;
  }
}
