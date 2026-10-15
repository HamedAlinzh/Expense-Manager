/**
 * Chart colors for the dark theme. Series hues come from the validated data-viz palette
 * (dark steps, checked against the card surface #121215: CVD ΔE 9.4, normal-vision ΔE 26.5).
 * Text never uses these — labels and values stay in text tokens.
 */
export const CHART = {
  surface: "#121215",
  grid: "#27272a",
  axis: "#3f3f46",
  tick: "#8b8b94",
  income: "#199e70", // aqua
  expense: "#d95926", // orange
  cursor: "rgba(255,255,255,0.04)",
} as const;

export const axisTick = { fill: CHART.tick, fontSize: 11 } as const;
