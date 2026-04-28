import * as React from "react";
import { useTranslation } from "react-i18next";
import type { FontType } from "@shared/utils/googleFonts";
import { GOOGLE_FONTS } from "@shared/utils/googleFonts";
import type { Option } from "~/components/InputSelect";
import { InputSelect } from "~/components/InputSelect";

type Props = {
  /** The type of font (heading or body) */
  type: FontType;
  /** The current selected font name */
  value?: string | null;
  /** Callback when font selection changes */
  onChange: (value: string | null) => void;
  /** Label for the select input */
  label: string;
};

/**
 * A dropdown component for selecting Google Fonts.
 * Shows a curated list of fonts based on the type (heading or body).
 */
const SYSTEM_DEFAULT = "system-default";

const InputFontSelect: React.FC<Props> = ({ type, value, onChange, label }) => {
  const { t } = useTranslation();
  const fonts = GOOGLE_FONTS[type];

  const options: Option[] = React.useMemo(
    () => [
      {
        type: "item" as const,
        label: t("System default"),
        value: SYSTEM_DEFAULT,
      },
      {
        type: "separator" as const,
      },
      ...fonts.map((font) => ({
        type: "item" as const,
        label: font.name,
        value: font.name,
      })),
    ],
    [fonts, t]
  );

  const handleChange = React.useCallback(
    (val: string) => {
      onChange(val === SYSTEM_DEFAULT ? null : val);
    },
    [onChange]
  );

  return (
    <InputSelect
      options={options}
      value={value ?? SYSTEM_DEFAULT}
      onChange={handleChange}
      label={label}
      hideLabel
    />
  );
};

export default InputFontSelect;
