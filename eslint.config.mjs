// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default [
  {
    ignores: [
      "deploy.cjs",
      "addon/content/mermaid.min.js",
      "addon/content/katex.min.css",
      "content/**",
      ".scaffold/**",
    ],
  },
  ...zotero({
    overrides: [
      {
        files: ["**/*.ts", "**/*.js"],
        rules: {
          "@typescript-eslint/no-unused-vars": "off",
          "@typescript-eslint/ban-ts-comment": "off",
          "@typescript-eslint/no-explicit-any": "off",
          "@typescript-eslint/no-require-imports": "off",
          "no-empty": "off",
        },
      },
    ],
  }),
];
