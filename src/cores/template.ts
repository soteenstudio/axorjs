export function generateHTML(
  jsCode: string,
  title: string = 'App Terkompilasi',
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin:0;padding:0;">
    <script>
        document.addEventListener("DOMContentLoaded", () => {
            ${jsCode}
        });
    </script>
</body>
</html>`;
}
