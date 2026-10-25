// Without this, X falls back to the root twitter-image (the homepage card)
// rather than the tool's own opengraph-image.
export { default, alt, size, contentType, generateStaticParams } from "./opengraph-image";
