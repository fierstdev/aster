import { encodeVLQ } from './compiler.ts';

// The slot emitter can reorder a key or duplicate a binding. Carry source ranges
// through it as opaque references, then expand them in their final output order.
export class SourceRanges {
  private readonly source: string;
  private readonly marker: string;
  private readonly references: RegExp;
  constructor(source: string, metadata: string) {
    this.source = source;
    let marker = '\0';
    while (source.includes(marker) || metadata.includes(marker)) marker += '\0';
    this.marker = marker;
    this.references = new RegExp(marker + '(\\d+):(\\d+)' + marker, 'g');
  }

  copy(start: number, end: number) {
    return start === end ? '' : this.marker + start + ':' + end + this.marker;
  }

  expand(code: string) {
    const starts = [0];
    for (let i = 0; i < this.source.length; i++) {
      if (this.source[i] === '\n') starts.push(i + 1);
    }
    const output: string[] = [],
      lines: string[] = [];
    let segments: string[] = [],
      column = 0,
      lastColumn = 0,
      mapped = false;
    let lastSourceLine = 0,
      lastSourceColumn = 0;
    const append = (chunk: string, offset?: number) => {
      output.push(chunk);
      let sourceLine = 0;
      if (offset !== undefined) {
        let end = starts.length;
        while (sourceLine + 1 < end) {
          const mid = (sourceLine + end) >>> 1;
          if (starts[mid] <= offset) sourceLine = mid;
          else end = mid;
        }
      }
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === '\n') {
          lines.push(segments.join(','));
          segments = [];
          column = lastColumn = 0;
          mapped = false;
          sourceLine++;
          continue;
        }
        if (offset !== undefined) {
          const sourceColumn = offset + i - starts[sourceLine];
          segments.push(
            encodeVLQ(column - lastColumn) +
              'A' +
              encodeVLQ(sourceLine - lastSourceLine) +
              encodeVLQ(sourceColumn - lastSourceColumn),
          );
          lastSourceLine = sourceLine;
          lastSourceColumn = sourceColumn;
          lastColumn = column;
          mapped = true;
        } else if (mapped) {
          segments.push(encodeVLQ(column - lastColumn));
          lastColumn = column;
          mapped = false;
        }
        column++;
      }
    };
    let cursor = 0;
    for (const match of code.matchAll(this.references)) {
      append(code.slice(cursor, match.index));
      const start = Number(match[1]);
      append(this.source.slice(start, Number(match[2])), start);
      cursor = match.index + match[0].length;
    }
    append(code.slice(cursor));
    lines.push(segments.join(','));
    return { code: output.join(''), mappings: lines.join(';') };
  }
}
