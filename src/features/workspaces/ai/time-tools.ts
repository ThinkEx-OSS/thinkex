import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const timeGetCurrentInputExamples = [{ input: {} }, { input: { time_zone: "America/New_York" } }];
const timeCalculateRelativeInputExamples = [
	{
		input: {
			days_ago: 7,
		},
	},
	{
		input: {
			days_ago: 1,
			time_zone: "America/Los_Angeles",
		},
	},
];
const MAX_RELATIVE_OFFSET = 10_000;

const timeZoneFieldSchema = z
	.string()
	.trim()
	.min(1)
	.optional()
	.describe(
		"Optional IANA time zone like America/New_York. Defaults to the user's current time zone when available, otherwise UTC.",
	);

function createRelativeOffsetFieldSchema(description: string) {
	return z.number().int().min(0).max(MAX_RELATIVE_OFFSET).optional().describe(description);
}

const timeGetCurrentInputSchema = z.object({
	time_zone: timeZoneFieldSchema,
});

const timeRelativeOffsetInputSchema = z.object({
	days_ago: createRelativeOffsetFieldSchema("Days to subtract from now."),
	months_ago: createRelativeOffsetFieldSchema("Calendar months to subtract from now."),
	weeks_ago: createRelativeOffsetFieldSchema("Weeks to subtract from now."),
	years_ago: createRelativeOffsetFieldSchema("Calendar years to subtract from now."),
	time_zone: timeZoneFieldSchema,
});

const timeRelativeOffsetOutputSchema = z.object({
	days_ago: z.number().int(),
	months_ago: z.number().int(),
	weeks_ago: z.number().int(),
	years_ago: z.number().int(),
});

const timePointOutputSchema = z.object({
	timestampSeconds: z.number().int(),
	timestampMilliseconds: z.number().int(),
	isoUtc: z.string(),
	timeZone: z.string(),
	localDateTime: z.string(),
});

const timeCalculateRelativeOutputSchema = z.object({
	current: timePointOutputSchema,
	calculated: timePointOutputSchema,
	offset: timeRelativeOffsetOutputSchema,
});

export function createAIThreadTimeTools(options?: { defaultTimeZone?: string }): ToolSet {
	return {
		time_get_current: tool({
			description:
				"Return the current time as exact UTC timestamps plus formatted local time in a requested IANA time zone. Defaults to the user's current time zone when available.",
			inputSchema: timeGetCurrentInputSchema,
			inputExamples: timeGetCurrentInputExamples,
			outputSchema: timePointOutputSchema,
			strict: true,
			execute: async (input) => {
				const timeZone = resolveTimeZone(input.time_zone, options?.defaultTimeZone);
				return formatTimeToolResult(new Date(), timeZone);
			},
		}),
		time_calculate_relative: tool({
			description:
				"Return a past exact time relative to now and formatted local time in an optional IANA time zone. Use for exact date filters like 24 hours ago, 7 days ago, or 3 months ago.",
			inputSchema: timeRelativeOffsetInputSchema,
			inputExamples: timeCalculateRelativeInputExamples,
			outputSchema: timeCalculateRelativeOutputSchema,
			strict: true,
			execute: async (input) => {
				const offset = normalizeRelativeOffset(input);
				const timeZone = resolveTimeZone(input.time_zone, options?.defaultTimeZone);
				const current = new Date();
				const calculated = subtractRelativeUtcDate(current, offset);

				return {
					current: formatTimeToolResult(current, timeZone),
					calculated: formatTimeToolResult(calculated, timeZone),
					offset,
				};
			},
		}),
	};
}

function formatTimeToolResult(date: Date, timeZone: string) {
	const timestampMilliseconds = date.getTime();

	if (!Number.isFinite(timestampMilliseconds)) {
		throw new Error("Calculated time is outside the supported date range.");
	}

	return {
		timestampSeconds: Math.floor(timestampMilliseconds / 1000),
		timestampMilliseconds,
		isoUtc: date.toISOString(),
		timeZone,
		localDateTime: getTimeToolDateTimeFormatter(timeZone).format(date),
	};
}

function normalizeRelativeOffset(input: z.input<typeof timeRelativeOffsetInputSchema>) {
	return {
		days_ago: input.days_ago ?? 0,
		months_ago: input.months_ago ?? 0,
		weeks_ago: input.weeks_ago ?? 0,
		years_ago: input.years_ago ?? 0,
	};
}

function subtractRelativeUtcDate(
	date: Date,
	input: z.output<typeof timeRelativeOffsetOutputSchema>,
) {
	const calendarAdjusted = subtractUtcCalendarMonthsAndYears(
		date,
		input.months_ago,
		input.years_ago,
	);
	const days = input.days_ago + input.weeks_ago * 7;

	return new Date(calendarAdjusted.getTime() - days * DAY_IN_MILLISECONDS);
}

function subtractUtcCalendarMonthsAndYears(date: Date, monthsAgo: number, yearsAgo: number) {
	const targetMonthStart = new Date(
		Date.UTC(
			date.getUTCFullYear() - yearsAgo,
			date.getUTCMonth() - monthsAgo,
			1,
			date.getUTCHours(),
			date.getUTCMinutes(),
			date.getUTCSeconds(),
			date.getUTCMilliseconds(),
		),
	);
	const lastTargetMonthDay = new Date(
		Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
	).getUTCDate();
	const targetDay = Math.min(date.getUTCDate(), lastTargetMonthDay);

	return new Date(
		Date.UTC(
			targetMonthStart.getUTCFullYear(),
			targetMonthStart.getUTCMonth(),
			targetDay,
			date.getUTCHours(),
			date.getUTCMinutes(),
			date.getUTCSeconds(),
			date.getUTCMilliseconds(),
		),
	);
}

const timeToolDateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function resolveTimeZone(value: string | undefined, fallback?: string) {
	return validateTimeZone(value) ?? validateTimeZone(fallback) ?? "UTC";
}

function validateTimeZone(value: string | undefined) {
	if (!value?.trim()) {
		return null;
	}

	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return value;
	} catch {
		return null;
	}
}

function getTimeToolDateTimeFormatter(timeZone: string) {
	const cachedFormatter = timeToolDateTimeFormatters.get(timeZone);

	if (cachedFormatter) {
		return cachedFormatter;
	}

	const formatter = new Intl.DateTimeFormat("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
		timeZone,
		timeZoneName: "short",
	});
	timeToolDateTimeFormatters.set(timeZone, formatter);

	return formatter;
}
