export class StreamParser {
  static parseLine(line: string): { text: string; done: boolean } | null {
    if (!line.startsWith('data: ')) return null;
    const jsonStr = line.slice(6).trim();
    if (jsonStr === '[DONE]') return { text: '', done: true };
    try {
      const data = JSON.parse(jsonStr);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const done = data.candidates?.[0]?.finishReason === 'STOP';
      return { text, done };
    } catch { return null; }
  }

  static async processStreamResponse(
    response: Response,
    onChunk: (text: string, done: boolean) => void
  ): Promise<string> {
    let fullText = '';
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done: readerDone, value } = await (reader as any).read();
      if (readerDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = StreamParser.parseLine(trimmed);
        if (parsed) {
          fullText += parsed.text;
          onChunk(parsed.text, parsed.done);
        }
      }
    }
    // Process remaining buffer
    if (buffer.trim()) {
      const parsed = StreamParser.parseLine(buffer.trim());
      if (parsed) {
        fullText += parsed.text;
        onChunk(parsed.text, true);
      }
    }
    onChunk('', true);
    return fullText;
  }
}
