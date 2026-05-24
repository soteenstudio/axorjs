export function minifyHTMLStructure(html: string): string {
  return html
    .replace(/>\s+</g, '><')
    .replace(/\s*[\r\n]\s*/g, '')
    .trim();
}
