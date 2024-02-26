
/*
 * LineStreamParser
 *
 * Receives a stream of Buffers (possibly from stdout/stderr) and 
 * parses them into full newline-separated lines.
 */
export class LineStreamParser {
  // currentLine contains the string for an unfinished line (when we haven't
  // received the newline yet)
  currentLine: string = null;

  *parse(data: Buffer): Iterable<string> {
    const dataStr = data.toString();
    const endsWithNewline = dataStr[dataStr.length - 1] == '\n';
    let lines = dataStr.split('\n').filter((s) => s !== '');
    let leftover = null;

    if (!endsWithNewline) {
      // Save the last line as leftover for later.
      leftover = lines[lines.length - 1];
      lines = lines.slice(0, lines.length - 1);
    }

    for (let line of lines) {
      if (this.currentLine) {
        line = this.currentLine + line;
        this.currentLine = null;
      }

      yield line;
    }

    if (endsWithNewline && this.currentLine) {
      // Edge case that can happen if the incoming data is only "\n".
      const line = this.currentLine;
      this.currentLine = null;
      yield line;
    }

    if (leftover) {
        this.currentLine = (this.currentLine || '') + leftover;
    }
  }
}
