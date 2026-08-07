import { SaxesParser } from "saxes";

const svgNamespace = "http://www.w3.org/2000/svg";

/** Validate plugin-owned compact icons without resolving external entities. */
export function assertValidCompactSvg(
  bytes: Uint8Array,
  label = "bb.branding.icon",
): void {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} must contain valid UTF-8 SVG bytes`);
  }

  const roots: Array<{ local: string; uri: string }> = [];
  let parseError: string | null = null;
  let hasDoctype = false;
  let hasProcessingInstruction = false;
  const parser = new SaxesParser({ xmlns: true });
  parser.on("opentag", (tag) => {
    if (roots.length === 0) roots.push({ local: tag.local, uri: tag.uri });
  });
  parser.on("doctype", () => {
    hasDoctype = true;
  });
  parser.on("processinginstruction", () => {
    hasProcessingInstruction = true;
  });
  parser.on("error", (error) => {
    parseError ??= error.message;
  });
  parser.write(source).close();

  if (hasDoctype) throw new Error(`${label} must not contain a doctype`);
  if (hasProcessingInstruction) {
    throw new Error(`${label} must not contain processing instructions`);
  }
  if (parseError)
    throw new Error(`${label} is not valid SVG XML: ${parseError}`);
  const root = roots[0];
  if (
    !root ||
    root.local !== "svg" ||
    (root.uri !== "" && root.uri !== svgNamespace)
  ) {
    throw new Error(`${label} must have an <svg> root element`);
  }
}
