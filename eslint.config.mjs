import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "reference/**", "designs/**", "playwright-report/**", "test-results/**", "next-env.d.ts", "docs/build-screens/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@next/next/no-img-element": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
export default config;
