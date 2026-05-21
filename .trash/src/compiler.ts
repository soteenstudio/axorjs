// compiler.ts
import * as htmlparser2 from "htmlparser2";
import { NATIVE_PRIMITIVES, transformAttribsToStyle } from "./transformer";

export function compileLownty(source: string): string {
  let jsOutput = "";
  const elementStack: string[] = ["root"];
  let count = 0;

  const parser = new htmlparser2.Parser({
    onopentag(name, attribs) {
      count++;
      const id = `el${count}`;
      const htmlTag = (name === "Text" ? "span" : (name === "Button" ? "button" : "div"));
      
      jsOutput += `const ${id} = document.createElement('${htmlTag}');\n`;
      
      const styles = [...(NATIVE_PRIMITIVES[name] || "").split(";"), ...transformAttribsToStyle(name, attribs)];
      styles.forEach(s => { if(s.trim()) jsOutput += `${id}.style.${s.split(":")[0].trim()} = '${s.split(":")[1]?.trim()}';\n` });
      
      jsOutput += `${elementStack[elementStack.length - 1]}.appendChild(${id});\n`;
      elementStack.push(id);
    },
    ontext(text) {
      if (text.trim()) jsOutput += `${elementStack[elementStack.length - 1]}.textContent = '${text.trim()}';\n`;
    },
    onclosetag() { elementStack.pop(); }
  });

  parser.write(source);
  return jsOutput;
}
