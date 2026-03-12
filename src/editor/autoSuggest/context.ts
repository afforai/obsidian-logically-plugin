import type { Text } from "@codemirror/state";

export interface ParagraphContext {
  text: string;
  from: number;
  to: number;
  hash: string;
}

const normalizeParagraph = (value: string): string =>
  value.replace(/\r\n?/g, "\n").trim();

const hashText = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const findParagraphRangeAtLine = (
  doc: Text,
  lineNumber: number,
): { from: number; to: number } => {
  let startLine = lineNumber;
  let endLine = lineNumber;

  while (startLine > 1) {
    const prev = doc.line(startLine - 1);
    if (prev.text.trim() === "") break;
    startLine -= 1;
  }

  while (endLine < doc.lines) {
    const next = doc.line(endLine + 1);
    if (next.text.trim() === "") break;
    endLine += 1;
  }

  const from = doc.line(startLine).from;
  const to = doc.line(endLine).to;
  return { from, to };
};

/**
 * Extracts suggestion source paragraph:
 * - current paragraph if non-empty
 * - otherwise nearest previous non-empty paragraph
 */
export const extractSuggestionContext = (
  doc: Text,
  cursorPos: number,
): ParagraphContext | null => {
  if (doc.length === 0) return null;

  const clampedPos = Math.max(0, Math.min(cursorPos, doc.length));
  const currentLine = doc.lineAt(clampedPos);
  const currentRange = findParagraphRangeAtLine(doc, currentLine.number);
  const currentText = doc.sliceString(currentRange.from, currentRange.to);

  if (currentText.trim() !== "") {
    const normalized = normalizeParagraph(currentText);
    return {
      text: currentText,
      from: currentRange.from,
      to: currentRange.to,
      hash: hashText(normalized),
    };
  }

  let scanLine = currentLine.number - 1;
  while (scanLine >= 1) {
    const line = doc.line(scanLine);
    if (line.text.trim() !== "") {
      const range = findParagraphRangeAtLine(doc, scanLine);
      const text = doc.sliceString(range.from, range.to);
      const normalized = normalizeParagraph(text);
      return {
        text,
        from: range.from,
        to: range.to,
        hash: hashText(normalized),
      };
    }
    scanLine -= 1;
  }

  return null;
};

export const hashParagraph = (value: string): string =>
  hashText(normalizeParagraph(value));
