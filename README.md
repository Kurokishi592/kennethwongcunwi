# kennethwongcunwi.com

Documenting my past and present for the future.

## Local development

Prereqs:
- Node.js `>=18.17.1`

Commands:
- Install: `npm install`
- Dev: `npm run dev`
- Check: `npm run check`
- Build: `npm run build`
- Preview: `npm run preview`

### Windows: "npm is not recognized"

If Node.js is installed but VS Code/PowerShell can’t find `node`/`npm`, it’s almost always a PATH inheritance issue (VS Code was opened before PATH updated).

Fixes:
- Fully close VS Code (all windows), reopen, then try again.
- If needed, confirm Node exists at `C:\Program Files\nodejs\node.exe`.

This repo includes a workspace setting at `.vscode/settings.json` that prepends `C:\Program Files\nodejs` to the integrated terminal PATH to avoid this recurring problem.
