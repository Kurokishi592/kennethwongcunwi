/// <reference types="astro/client" />

// VS Code can sometimes show TypeScript diagnostics like
// "Cannot find module './Component.astro'" in `.astro` files (especially in multi-root workspaces
// or when the Astro language server isn't being applied). This shim keeps the editor quiet.
declare module '*.astro' {
	const Component: any;
	export default Component;
}
