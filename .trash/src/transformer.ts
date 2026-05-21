export const NATIVE_PRIMITIVES: Record<string, string> = {
  View: "display: flex; flex-direction: column;",
  HStack: "display: flex; flex-direction: row;",
  VStack: "display: flex; flex-direction: column;",
  Text: "display: block; font-family: sans-serif;",
  Button: "cursor: pointer; padding: 8px 16px; border-radius: 4px; border: none;",
  Image: "display: block; object-fit: cover;",
  Input: "padding: 8px; border: 1px solid #ccc; border-radius: 4px;",
  Card: "border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px; background: white;",
  Spacer: "flex-grow: 1;"
};

export function transformAttribsToStyle(name: string, attribs: Record<string, string>): string[] {
  const styles: string[] = [];
  
  // Layout & Spacing
  if (attribs.padding) styles.push(`padding: ${attribs.padding}px`);
  if (attribs.margin) styles.push(`margin: ${attribs.margin}px`);
  if (attribs.width) styles.push(`width: ${attribs.width}px`);
  if (attribs.height) styles.push(`height: ${attribs.height}px`);
  if (attribs.spacing) styles.push(`gap: ${attribs.spacing}px`);

  // Visuals
  if (attribs.background) styles.push(`backgroundColor: ${attribs.background}`);
  if (attribs.color) styles.push(`color: ${attribs.color}`);
  if (attribs.radius) styles.push(`borderRadius: ${attribs.radius}px`);

  // Flex Helpers
  if (attribs.alignment === "center") {
    styles.push("alignItems: center; justifyContent: center;");
  } else if (attribs.alignment === "start") {
    styles.push("alignItems: flex-start;");
  }

  // Component Specific
  if (name === "Image" && attribs.src) {
    // Note: src bakal ditaruh di logic element, bukan style
  }

  return styles;
}
