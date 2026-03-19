import { useTheme } from "styled-components";
import { cdnPath } from "@shared/utils/urls";

type Props = {
  size?: number;
  alt?: string;
  className?: string;
};

/**
 * Workspace-branded fallback icon used only on product identity surfaces when
 * a team-specific logo is not available.
 */
export default function BrandIcon({
  size = 24,
  alt = "",
  className,
}: Props) {
  const theme = useTheme();
  const src = theme.isDark
    ? cdnPath("/images/brand/xfoundry-mark-light.svg")
    : cdnPath("/images/brand/xfoundry-mark-dark.svg");

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
    />
  );
}
