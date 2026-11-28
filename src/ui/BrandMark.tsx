import {
  appearanceMode,
  useAppearance,
} from "../features/settings/appearance.js";
import lightLogo from "../assets/pakka-logo.svg";
import darkLogo from "../assets/pakka-logo-dark.svg";

export const brandImages = {
  light: new URL(lightLogo, import.meta.url).href,
  dark: new URL(darkLogo, import.meta.url).href,
};

/** Original brand assets; theme selection preserves their geometry and colors. */
export function BrandMark() {
  const { preferences } = useAppearance();
  const mode = appearanceMode(preferences);
  return (
    <picture className="brand-mark">
      {mode === "system" && (
        <source
          media="(prefers-color-scheme: dark)"
          srcSet={brandImages.dark}
        />
      )}
      <img
        src={mode === "dark" ? brandImages.dark : brandImages.light}
        alt=""
        width={200}
        height={200}
        draggable={false}
      />
    </picture>
  );
}
