import { existsSync, readFileSync, writeFileSync } from "node:fs";

const generatedWranglerConfigPath = "dist/server/wrangler.json";

const observability = {
	enabled: true,
	logs: {
		enabled: true,
		head_sampling_rate: 1,
		invocation_logs: true,
		persist: true,
	},
	traces: {
		enabled: true,
		head_sampling_rate: 1,
		persist: true,
	},
};

if (!existsSync(generatedWranglerConfigPath)) {
	console.warn(
		`Skipping Worker observability patch; ${generatedWranglerConfigPath} was not found.`,
	);
	process.exit(0);
}

const generatedWranglerConfig = JSON.parse(readFileSync(generatedWranglerConfigPath, "utf8"));
generatedWranglerConfig.observability = observability;
writeFileSync(generatedWranglerConfigPath, `${JSON.stringify(generatedWranglerConfig)}\n`);

console.log(`Patched Worker observability in ${generatedWranglerConfigPath}.`);
