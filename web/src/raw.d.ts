// Vite ?raw imports (the Terms / Privacy Markdown in docs/legal) arrive as plain strings.
declare module '*?raw' {
  const content: string
  export default content
}
