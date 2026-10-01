export const PALETTE_POINTS = { default: 0, ocean: 40, plum: 120 } as const;
export const ACCENT_POINTS = { default: 0, gold: 100, violet: 250 } as const;
export type Palette = keyof typeof PALETTE_POINTS;
export type ContributionAccent = keyof typeof ACCENT_POINTS;
export type Cosmetics = { palette: Palette; accent: ContributionAccent };
export type CosmeticsUpdate = Partial<Cosmetics>;
export const DEFAULT_COSMETICS: Cosmetics = { palette: "default", accent: "default" };
export const ACCENT_COLORS = { gold: "#D6A32B", violet: "#A582E3" } as const;

export function eligibleCosmetics(points: number, palette?: string, accent?: string): Cosmetics {
  return {
    palette: palette && Object.hasOwn(PALETTE_POINTS, palette) && points >= PALETTE_POINTS[palette as Palette] ? palette as Palette : "default",
    accent: accent && Object.hasOwn(ACCENT_POINTS, accent) && points >= ACCENT_POINTS[accent as ContributionAccent] ? accent as ContributionAccent : "default",
  };
}
export function accentColor(accent?: ContributionAccent) {
  return accent === "gold" || accent === "violet" ? ACCENT_COLORS[accent] : undefined;
}

// Only app surfaces and controls change. Status/error colors retain their meaning.
export const PALETTE_COLORS = {
  ocean: {
    light: { ink: "#193A45", muted: "#526E77", green: "#08677D", accentText: "#08677D", mint: "#DBEDF0", paper: "#F1F8FA", line: "#BDD6DD", input: "#FAFDFE" },
    dark: { ink: "#E5F4F7", muted: "#A2C1CB", green: "#26768C", accentText: "#7ECCDF", mint: "#213E48", paper: "#132831", line: "#3B5865", input: "#1C3540" },
  },
  plum: {
    light: { ink: "#3E2943", muted: "#785F7D", green: "#7B3F89", accentText: "#7B3F89", mint: "#EEDFF1", paper: "#FBF4FC", line: "#DCC4E0", input: "#FEFAFF" },
    dark: { ink: "#F7E9FA", muted: "#CCADD1", green: "#9757A5", accentText: "#E1B0EB", mint: "#49304F", paper: "#2C1D31", line: "#66466E", input: "#3C2843" },
  },
} as const;
