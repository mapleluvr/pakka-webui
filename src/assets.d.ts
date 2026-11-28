/** Stylesheet imports are emitted as CSS files by the application esbuild entry. */
declare module "*.css" {}

/** SVG imports refer to original files emitted beside the application. */
declare module "*.svg" {
  const path: string;
  export default path;
}
