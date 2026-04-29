import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#090b0f",
        panel: "#10141b",
        panel2: "#151b24",
        line: "#27313f",
        text: "#e8eef7",
        muted: "#8b9aae",
        cyan: "#38d5c8",
        amber: "#ffbe55",
        red: "#ff5a6a",
        green: "#63d471",
        violet: "#9d7dff"
      },
      boxShadow: {
        control: "0 16px 50px rgba(0, 0, 0, 0.38)"
      }
    }
  },
  plugins: []
};

export default config;
