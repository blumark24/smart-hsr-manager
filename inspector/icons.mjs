const paths = {
  navigate: "M21 3 3 10l7 3 3 8Z",
  target:
    "M12 2v3m0 14v3M2 12h3m14 0h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  layers: "m12 3 10 6-10 6L2 9Zm-9 11 9 5 9-5M3 18l9 5 9-5",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M20 4l-2 2M6 18l-2 2",
  signal: "M4 15h3v7H4zM10 9h3v13h-3zM16 3h3v19h-3z",
  chevron: "m14 5-7 7 7 7",
  sparkle: "m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z",

  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  tasks: "M5 3h14v18H5zM8 7h8M8 11h8M8 15h5",
  plus: "M12 4v16M4 12h16",
  chart: "M4 14h3v7H4zM10 9h3v12h-3zM16 3h3v18h-3z",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 6 0 0 1 16 0v2Z",
  camera: "M3 6h4l2-3h6l2 3h4v15H3ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  pin: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  scan: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8z",
  bell: "M5 17h14l-2-3V9A5 5 0 0 0 7 9v5ZM10 21h4",
};
export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.pin}"/></svg>`;
}
