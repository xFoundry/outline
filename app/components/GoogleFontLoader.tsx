import * as React from "react";
import { buildGoogleFontsUrl } from "@shared/utils/googleFonts";

type Props = {
  headingFont?: string;
  bodyFont?: string;
};

/**
 * Component that dynamically loads Google Fonts by injecting stylesheet links
 * into the document head. Includes preconnect hints for performance.
 */
const GoogleFontLoader: React.FC<Props> = ({ headingFont, bodyFont }) => {
  React.useEffect(() => {
    // Only proceed if we have custom fonts to load
    if (!headingFont && !bodyFont) {
      return;
    }

    // Add preconnect links for performance
    const preconnect1 = document.createElement("link");
    preconnect1.rel = "preconnect";
    preconnect1.href = "https://fonts.googleapis.com";
    document.head.appendChild(preconnect1);

    const preconnect2 = document.createElement("link");
    preconnect2.rel = "preconnect";
    preconnect2.href = "https://fonts.gstatic.com";
    preconnect2.crossOrigin = "anonymous";
    document.head.appendChild(preconnect2);

    // Build and inject stylesheet
    const fontsUrl = buildGoogleFontsUrl({
      heading: headingFont,
      body: bodyFont,
    });
    let styleLink: HTMLLinkElement | null = null;

    if (fontsUrl) {
      // Remove any existing custom font link
      const existing = document.getElementById("google-fonts-custom");
      if (existing) {
        existing.remove();
      }

      styleLink = document.createElement("link");
      styleLink.rel = "stylesheet";
      styleLink.href = fontsUrl;
      styleLink.id = "google-fonts-custom";
      document.head.appendChild(styleLink);
    }

    return () => {
      // Cleanup on unmount
      preconnect1.remove();
      preconnect2.remove();
      styleLink?.remove();
    };
  }, [headingFont, bodyFont]);

  return null;
};

export default GoogleFontLoader;
