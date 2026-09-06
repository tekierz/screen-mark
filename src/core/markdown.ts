/** Keep user content inside a single Markdown table cell. Apply styling afterward. */
export function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r\n|[\r\n]/g, ' ');
}
