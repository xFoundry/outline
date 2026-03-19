import { observer } from "mobx-react";
import * as React from "react";
import { ThemeProvider } from "styled-components";
import GlobalStyles from "@shared/styles/globals";
import { TeamPreference, UserPreference } from "@shared/types";
import GoogleFontLoader from "~/components/GoogleFontLoader";
import useBuildTheme from "~/hooks/useBuildTheme";
import useStores from "~/hooks/useStores";

type Props = {
  children?: React.ReactNode;
};

const Theme: React.FC = ({ children }: Props) => {
  const { auth, ui } = useStores();
  const customTheme =
    auth.team?.getPreference(TeamPreference.CustomTheme) ||
    auth.config?.customTheme ||
    undefined;
  const theme = useBuildTheme(customTheme);

  React.useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("theme-changed", {
        detail: { isDark: ui.resolvedTheme === "dark" },
      })
    );
  }, [ui.resolvedTheme]);

  return (
    <ThemeProvider theme={theme}>
      <>
        <GoogleFontLoader
          headingFont={customTheme?.fontFamilyHeading}
          bodyFont={customTheme?.fontFamilyBody}
        />
        <GlobalStyles
          useCursorPointer={
            // Default to showing the cursor pointer if no user is logged in (public share)
            auth.user?.getPreference(UserPreference.UseCursorPointer) ?? true
          }
        />
        {children}
      </>
    </ThemeProvider>
  );
};

export default observer(Theme);
