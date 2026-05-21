// generator.ts
import { compileLownty } from "./compiler";

export function generateFullHTML(source: string): string {
  const logic = compileLownty(source);
  return `
<!DOCTYPE html>
<html>
<head><title>Lownty App</title></head>
<body>
  <div id="root"></div>
  <script>
    const root = document.getElementById('root');
    (function render() {
      ${logic}
    })();
  </script>
</body>
</html>
`;
}
