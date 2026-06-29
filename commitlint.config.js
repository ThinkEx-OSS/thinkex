/** @type {import('@commitlint/config-conventional').UserConfig} */
export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"scope-empty": [2, "never"],
		"header-max-length": [2, "always", 72],
		"type-enum": [
			2,
			"always",
			[
				"build",
				"chore",
				"ci",
				"docs",
				"feat",
				"fix",
				"perf",
				"refactor",
				"revert",
				"style",
				"test",
			],
		],
	},
};
