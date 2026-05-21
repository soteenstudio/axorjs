export interface DOMNode {
  type: 'tag' | 'text';
  name?: string;
  attribs?: Record<string, string>;
  children?: DOMNode[];
  data?: string;
}
