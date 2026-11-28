import { useSyncExternalStore } from "react";

export const palettes = [
  { id: "neutral", name: "原色", description: "简洁黑白 · 随明暗切换" },
  {
    id: "pine",
    name: "浅松 · 艾青",
    description: "双色点缀 · 白字 · 固定配色",
  },
  { id: "plum", name: "乌梅 · 玉白", description: "乌梅紫与玉白 · 随明暗反转" },
  { id: "jade", name: "黛青 · 月白", description: "黛青与月白 · 随明暗反转" },
  { id: "blue", name: "霁蓝 · 茶白", description: "霁蓝底、茶白字 · 固定配色" },
] as const;
export type Palette = (typeof palettes)[number]["id"];

export type Appearance = {
  palette: Palette;
  mode: "system" | "light" | "dark";
  font: "system" | "serif" | "mono";
  size: 16 | 18 | 20 | 22 | 24;
};
const key = "pakka-webui-appearance-v1";
export const defaultAppearance: Appearance = {
  palette: "neutral",
  mode: "system",
  font: "system",
  size: 16,
};
export const textSizes = [16, 18, 20, 22, 24] as const;

function decode(raw: string | null): Appearance {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      !("mode" in value) ||
      !("font" in value) ||
      !("size" in value)
    )
      return defaultAppearance;
    const mode =
      value.mode === "light" || value.mode === "dark" ? value.mode : "system";
    const font =
      value.font === "serif" || value.font === "mono" ? value.font : "system";
    const size = textSizes.find((size) => size === value.size) ?? 16;
    const palette =
      palettes.find((item) => "palette" in value && item.id === value.palette)
        ?.id ?? "neutral";
    return { mode, font, size, palette };
  } catch {
    return defaultAppearance;
  }
}
function load() {
  try {
    return { preferences: decode(localStorage.getItem(key)), saved: true };
  } catch {
    return { preferences: defaultAppearance, saved: false };
  }
}
let state = load();
const listeners = new Set<() => void>();
export function appearanceMode(preferences: Appearance): Appearance["mode"] {
  return preferences.palette === "pine" || preferences.palette === "blue"
    ? "dark"
    : preferences.mode;
}
function apply() {
  document.documentElement.dataset.pakkaPalette = state.preferences.palette;
  document.documentElement.dataset.readingFont = state.preferences.font;
  document.documentElement.dataset.readingSize = String(state.preferences.size);
}
apply();
function notify() {
  apply();
  for (const listener of listeners) listener();
}
function storage(event: StorageEvent) {
  if (event.key !== key && event.key !== null) return;
  state = {
    preferences: decode(event.key === null ? null : event.newValue),
    saved: true,
  };
  notify();
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", storage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", storage);
  };
}
export function useAppearance() {
  return useSyncExternalStore(subscribe, () => state);
}
export function changeAppearance(preferences: Appearance) {
  let saved = true;
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    saved = false;
  }
  state = { preferences, saved };
  notify();
}
