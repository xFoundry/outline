import * as React from "react";
import { useTranslation } from "react-i18next";
import { GOOGLE_FONTS, FontType } from "@shared/utils/googleFonts";
import { InputSelect, Option } from "~/components/InputSelect";

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
const InputFontSelect: React.FC<Props> = ({ type, value, onChange, label }) => {
  const { t } = useTranslation();
  const fonts = GOOGLE_FONTS[type];

  const options: Option[] = React.useMemo(
    () => [
      {
        type: "item" as const,
        label: t("System default"),
        value: "",
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
      onChange(val === "" ? null : val);
    },
    [onChange]
  );

  return (
    <InputSelect
      options={options}
      value={value ?? ""}
      onChange={handleChange}
      label={label}
      hideLabel
    />
  );
};

export default InputFontSelect;
