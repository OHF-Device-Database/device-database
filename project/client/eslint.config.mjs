// @ts-check

import eslint from "@eslint/js";
import { configs as configLit } from "eslint-plugin-lit";
import { configs as configTs } from "typescript-eslint";
import { configs as configWc } from "eslint-plugin-wc";
import configPrettier from "eslint-plugin-prettier/recommended";
import { defineConfig, globalIgnores } from "eslint/config";
import configComments from "@eslint-community/eslint-plugin-eslint-comments/configs";

export default defineConfig(
	[
		{
			files: ["src/**/*.ts"],
		},
		globalIgnores([
			"src/schema.ts",
			"build.config.ts",
			"watch.ts",
			"eslint.config.mjs",
		]),
	],
	configPrettier,
	eslint.configs.recommended,
	configTs.strictTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
		rules: { "@typescript-eslint/consistent-type-imports": "error" },
	},
	configLit["flat/all"],
	configWc["flat/recommended"],
	// `eslint-plugin-eslint-comments` has no type definitions
	// @ts-expect-error
	configComments.recommended,
	{
		rules: {
			"@eslint-community/eslint-comments/require-description": [
				"error",
				{ ignore: ["eslint-enable"] },
			],
			// doesn't compose well with "lit/no-template-arrow"
			"@typescript-eslint/unbound-method": "off",
		},
	}
);
