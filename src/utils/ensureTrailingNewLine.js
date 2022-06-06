import os from 'os';

export default function ensureTrailingNewLine(contents) {
  if (!contents.endsWith(os.EOL)) return contents + os.EOL;
  return contents;
}
