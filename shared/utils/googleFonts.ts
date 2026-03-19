/**
 * Curated list of Google Fonts for workspace customization.
 */
export const GOOGLE_FONTS = {
  heading: [
    { name: "Exo 2", value: "Exo+2" },
    { name: "Poppins", value: "Poppins" },
    { name: "Montserrat", value: "Montserrat" },
    { name: "Playfair Display", value: "Playfair+Display" },
    { name: "Merriweather", value: "Merriweather" },
    { name: "Oswald", value: "Oswald" },
    { name: "Raleway", value: "Raleway" },
    { name: "Roboto Slab", value: "Roboto+Slab" },
    { name: "Lora", value: "Lora" },
    { name: "Fira Sans", value: "Fira+Sans" },
    { name: "Work Sans", value: "Work+Sans" },
    { name: "Libre Baskerville", value: "Libre+Baskerville" },
  ],
  body: [
    { name: "Hanken Grotesk", value: "Hanken+Grotesk" },
    { name: "Inter", value: "Inter" },
    { name: "Open Sans", value: "Open+Sans" },
    { name: "Lato", value: "Lato" },
    { name: "Roboto", value: "Roboto" },
    { name: "Source Sans Pro", value: "Source+Sans+3" },
    { name: "Nunito", value: "Nunito" },
    { name: "Noto Sans", value: "Noto+Sans" },
    { name: "PT Sans", value: "PT+Sans" },
    { name: "Mulish", value: "Mulish" },
    { name: "IBM Plex Sans", value: "IBM+Plex+Sans" },
    { name: "DM Sans", value: "DM+Sans" },
  ],
} as const;

export type FontType = keyof typeof GOOGLE_FONTS;

/**
 * Builds a Google Fonts stylesheet URL for the given fonts.
 * @param fonts Object with optional heading and body font names
 * @returns Google Fonts CSS URL or null if no fonts specified
 */
export function buildGoogleFontsUrl(fonts: {
  heading?: string;
  body?: string;
}): string | null {
  const fontParams: string[] = [];

  if (fonts.heading) {
    const headingFont = GOOGLE_FONTS.heading.find(
      (f) => f.name === fonts.heading
    );
    if (headingFont) {
      fontParams.push(`family=${headingFont.value}:wght@400;500;600;700`);
    }
  }

  if (fonts.body) {
    const bodyFont = GOOGLE_FONTS.body.find((f) => f.name === fonts.body);
    if (bodyFont) {
      fontParams.push(`family=${bodyFont.value}:wght@400;500;600`);
    }
  }

  if (fontParams.length === 0) {
    return null;
  }

  return `https://fonts.googleapis.com/css2?${fontParams.join("&")}&display=swap`;
}

/**
 * Builds a font-family CSS value with fallbacks.
 * @param fontName The Google Font name
 * @returns CSS font-family string with fallbacks
 */
export function buildFontStack(fontName: string | undefined): string {
  const defaultStack =
    "-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', Roboto, Oxygen, sans-serif";

  if (!fontName) {
    return defaultStack;
  }

  return `"${fontName}", ${defaultStack}`;
}
