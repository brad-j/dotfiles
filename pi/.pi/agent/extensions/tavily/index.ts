import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_MAX_BYTES = 50 * 1024;
const DEFAULT_MAX_LINES = 2000;

interface TruncationResult {
	content: string;
	truncated: boolean;
	outputLines: number;
	totalLines: number;
	outputBytes: number;
	totalBytes: number;
}

const SEARCH_DEPTH_VALUES = ["basic", "fast", "ultra-fast", "advanced"] as const;
const CRAWL_CATEGORY_VALUES = ["general", "documentation", "news", "blog"] as const;
const TOPIC_VALUES = ["general", "news", "finance"] as const;
const TIME_RANGE_VALUES = ["day", "week", "month", "year"] as const;
const EXTRACT_DEPTH_VALUES = ["basic", "advanced"] as const;
const FORMAT_VALUES = ["markdown", "text"] as const;

const TAVILY_BASE_URL = "https://api.tavily.com";
const CONFIG_PATH = join(homedir(), ".pi", "web-search.json");

function StringEnum<const T extends readonly string[]>(values: T) {
	return Type.Union(values.map((value) => Type.Literal(value)) as any);
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kib = bytes / 1024;
	if (kib < 1024) return `${kib.toFixed(1)} KiB`;
	return `${(kib / 1024).toFixed(1)} MiB`;
}

function truncateHead(text: string, limits: { maxLines: number; maxBytes: number }): TruncationResult {
	const totalBytes = Buffer.byteLength(text, "utf8");
	const lines = text.split("\n");
	const totalLines = lines.length;

	let output = lines.slice(0, limits.maxLines).join("\n");
	let outputLines = Math.min(totalLines, limits.maxLines);

	while (Buffer.byteLength(output, "utf8") > limits.maxBytes && output.length > 0) {
		output = output.slice(0, Math.max(0, Math.floor(output.length * 0.9)));
		outputLines = output.split("\n").length;
	}

	const outputBytes = Buffer.byteLength(output, "utf8");
	return {
		content: output,
		truncated: outputBytes < totalBytes || outputLines < totalLines,
		outputLines,
		totalLines,
		outputBytes,
		totalBytes,
	};
}

const webSearchSchema = Type.Object({
	query: Type.String({ description: "Search query" }),
	maxResults: Type.Optional(Type.Number({ description: "Maximum number of results to return (default: 5)" })),
	topic: Type.Optional(StringEnum(TOPIC_VALUES)),
	searchDepth: Type.Optional(StringEnum(SEARCH_DEPTH_VALUES)),
	includeDomains: Type.Optional(Type.Array(Type.String())),
	excludeDomains: Type.Optional(Type.Array(Type.String())),
	timeRange: Type.Optional(StringEnum(TIME_RANGE_VALUES)),
	includeAnswer: Type.Optional(Type.Boolean()),
	includeRawContent: Type.Optional(Type.Boolean()),
	timeout: Type.Optional(Type.Number({ description: "Request timeout in seconds (default: 20)" })),
});

const webCrawlSchema = Type.Object({
	url: Type.String({ description: "Root URL to begin crawling from" }),
	instructions: Type.Optional(Type.String({ description: "Natural language instructions to filter which pages to crawl" })),
	maxDepth: Type.Optional(Type.Number({ description: "Max depth of links to follow from root (default: 1)" })),
	maxBreadth: Type.Optional(Type.Number({ description: "Max number of pages to crawl per depth level (default: 10)" })),
	limit: Type.Optional(Type.Number({ description: "Max total pages to crawl (default: 10)" })),
	timeout: Type.Optional(Type.Number({ description: "Request timeout in seconds (default: 60)" })),
});

const webMapSchema = Type.Object({
	url: Type.String({ description: "Root URL to map — returns all discovered URLs on the site" }),
	timeout: Type.Optional(Type.Number({ description: "Request timeout in seconds (default: 30)" })),
});

const webResearchSchema = Type.Object({
	query: Type.String({ description: "Research topic or question. Tavily conducts multiple searches, cross-references sources, and returns a synthesized report." }),
	timeout: Type.Optional(Type.Number({ description: "Max seconds to wait for the research report to complete (default: 120)" })),
});

const webFetchSchema = Type.Object({
	url: Type.Optional(Type.String({ description: "Single URL to fetch" })),
	urls: Type.Optional(Type.Array(Type.String({ description: "URLs to fetch" }))),
	extractDepth: Type.Optional(StringEnum(EXTRACT_DEPTH_VALUES)),
	format: Type.Optional(StringEnum(FORMAT_VALUES)),
	includeImages: Type.Optional(Type.Boolean()),
	query: Type.Optional(Type.String()),
	chunksPerSource: Type.Optional(Type.Number()),
	timeout: Type.Optional(Type.Number({ description: "Request timeout in seconds (default: 20)" })),
});

interface TavilyOutputEnvelope {
	text: string;
	truncation?: TruncationResult;
	fullOutputPath?: string;
}

export default function tavilyExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Search the web via Tavily and return ranked results.",
		parameters: webSearchSchema,
		async execute(_toolCallId, params, signal) {
			const query = String(params.query ?? "").trim();
			if (!query) throw new Error("Query cannot be empty.");

			const maxResults = clampNumber(params.maxResults, 1, 20, 5);
			const topic = oneOf(params.topic, TOPIC_VALUES, "general");
			const searchDepth = oneOf(params.searchDepth, SEARCH_DEPTH_VALUES, "basic");
			const includeAnswer = Boolean(params.includeAnswer ?? false);
			const includeRawContent = Boolean(params.includeRawContent ?? false);
			const timeout = clampNumber(params.timeout, 1, 120, 20);

			const includeDomains = toNonEmptyStrings(params.includeDomains);
			const excludeDomains = toNonEmptyStrings(params.excludeDomains);
			const timeRange = oneOfOptional(params.timeRange, TIME_RANGE_VALUES);

			const request: Record<string, unknown> = {
				query,
				max_results: maxResults,
				topic,
				search_depth: searchDepth,
				include_answer: includeAnswer,
				include_raw_content: includeRawContent,
			};

			if (includeDomains.length > 0) request.include_domains = includeDomains;
			if (excludeDomains.length > 0) request.exclude_domains = excludeDomains;
			if (timeRange) request.time_range = timeRange;

			const response = await tavilyPost("/search", request, timeout, signal);
			const answer = firstString(response?.answer);
			const requestId = firstString(response?.request_id, response?.requestId);

			const results = normalizeSearchResults(response?.results).slice(0, maxResults);
			const lines: string[] = [];
			lines.push(`Search results for: ${query}`);
			lines.push(`Results: ${results.length}`);

			if (answer) {
				lines.push("");
				lines.push("Answer:");
				lines.push(answer);
			}

			if (results.length > 0) {
				lines.push("");
				results.forEach((result, index) => {
					lines.push(`${index + 1}. ${result.title}`);
					if (result.url) lines.push(`   ${result.url}`);
					if (result.content) lines.push(`   ${truncateText(result.content, 280)}`);
				});
			} else {
				lines.push("");
				lines.push("No results returned.");
			}

			const output = withOutputLimit("web-search", lines.join("\n"));
			const details: Record<string, unknown> = {
				request,
				summary: {
					requestId,
					resultCount: results.length,
				},
				results,
			};
			if (answer) details.answer = answer;
			if (output.truncation) details.truncation = output.truncation;
			if (output.fullOutputPath) details.fullOutputPath = output.fullOutputPath;

			return {
				content: [{ type: "text", text: output.text }],
				details,
			};
		},
	});

	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description: "Fetch and extract web page content via Tavily.",
		parameters: webFetchSchema,
		async execute(_toolCallId, params, signal) {
			const timeout = clampNumber(params.timeout, 1, 120, 20);
			const extractDepth = oneOf(params.extractDepth, EXTRACT_DEPTH_VALUES, "basic");
			const format = oneOf(params.format, FORMAT_VALUES, "markdown");
			const includeImages = Boolean(params.includeImages ?? false);
			const chunksPerSource = clampNumberOptional(params.chunksPerSource, 1, 20);
			const query = firstString(params.query);

			const { validUrls, invalidUrls } = splitAndValidateUrls(params.url, params.urls);
			if (validUrls.length === 0) {
				const hint = invalidUrls.length > 0 ? ` Invalid values: ${invalidUrls.map((x) => x.url).join(", ")}` : "";
				throw new Error(`Provide at least one valid http(s) URL using 'url' or 'urls'.${hint}`);
			}

			const request: Record<string, unknown> = {
				urls: validUrls,
				extract_depth: extractDepth,
				format,
				include_images: includeImages,
			};
			if (query) request.query = query;
			if (typeof chunksPerSource === "number") request.chunks_per_source = chunksPerSource;

			const response = await tavilyPost("/extract", request, timeout, signal);
			const requestId = firstString(response?.request_id, response?.requestId);

			const success = normalizeExtractSuccess(response?.results);
			const failed = [...normalizeExtractFailed(response?.failed_results), ...invalidUrls];

			const lines: string[] = [];
			lines.push("Fetched pages:");
			lines.push(`Success: ${success.length}, Failed: ${failed.length}`);

			if (success.length > 0) {
				lines.push("");
				success.forEach((result) => {
					lines.push(`- ${result.title || "(untitled)"}`);
					lines.push(`  ${result.url}`);
					if (result.content) lines.push(`  ${truncateText(result.content, 360)}`);
				});
			}

			if (failed.length > 0) {
				lines.push("");
				lines.push("Failed URLs:");
				failed.forEach((item) => lines.push(`- ${item.url}: ${item.error}`));
			}

			if (success.length === 0 && failed.length === 0) {
				lines.push("");
				lines.push("No pages returned by Tavily.");
			}

			const output = withOutputLimit("web-fetch", lines.join("\n"));
			const details: Record<string, unknown> = {
				request,
				summary: {
					requestId,
					successCount: success.length,
					failedCount: failed.length,
				},
				results: {
					success,
					failed,
				},
			};
			if (output.truncation) details.truncation = output.truncation;
			if (output.fullOutputPath) details.fullOutputPath = output.fullOutputPath;

			return {
				content: [{ type: "text", text: output.text }],
				details,
			};
		},
	});

	pi.registerTool({
		name: "web_crawl",
		label: "Web Crawl",
		description: "Crawl a website starting from a root URL, following links and returning page content. Accepts optional natural language instructions to filter which pages to explore.",
		parameters: webCrawlSchema,
		async execute(_toolCallId, params, signal) {
			const url = String(params.url ?? "").trim();
			if (!url) throw new Error("URL cannot be empty.");

			const timeout = clampNumber(params.timeout, 10, 150, 60);
			const maxDepth = clampNumber(params.maxDepth, 1, 10, 1);
			const maxBreadth = clampNumber(params.maxBreadth, 1, 100, 10);
			const limit = clampNumber(params.limit, 1, 100, 10);
			const instructions = firstString(params.instructions);

			const request: Record<string, unknown> = {
				url,
				max_depth: maxDepth,
				max_breadth: maxBreadth,
				limit,
				timeout,
			};
			if (instructions) request.instructions = instructions;

			const response = await tavilyPost("/crawl", request, timeout, signal);
			const results: Array<{ url: string; content: string }> = Array.isArray(response?.results) ? response.results : [];

			const lines: string[] = [];
			lines.push(`Crawled: ${url}`);
			if (instructions) lines.push(`Instructions: ${instructions}`);
			lines.push(`Pages found: ${results.length}`);

			if (results.length > 0) {
				lines.push("");
				results.forEach((page, i) => {
					lines.push(`--- Page ${i + 1}: ${page.url} ---`);
					if (page.content) lines.push(truncateText(page.content, 2000));
					lines.push("");
				});
			} else {
				lines.push("No pages returned.");
			}

			const output = withOutputLimit("web-crawl", lines.join("\n"));
			return {
				content: [{ type: "text", text: output.text }],
				details: { request, pageCount: results.length, results },
			};
		},
	});

	pi.registerTool({
		name: "web_map",
		label: "Web Map",
		description: "Return a list of all URLs discovered on a site starting from a root URL. Useful for exploring site structure before crawling.",
		parameters: webMapSchema,
		async execute(_toolCallId, params, signal) {
			const url = String(params.url ?? "").trim();
			if (!url) throw new Error("URL cannot be empty.");

			const timeout = clampNumber(params.timeout, 10, 150, 30);
			const request: Record<string, unknown> = { url, timeout };

			const response = await tavilyPost("/map", request, timeout, signal);
			const urls: string[] = Array.isArray(response?.results) ? response.results.filter((u: unknown) => typeof u === "string") : [];

			const lines: string[] = [];
			lines.push(`Site map for: ${url}`);
			lines.push(`URLs found: ${urls.length}`);
			if (urls.length > 0) {
				lines.push("");
				urls.forEach((u) => lines.push(u));
			}

			const output = withOutputLimit("web-map", lines.join("\n"));
			return {
				content: [{ type: "text", text: output.text }],
				details: { request, urlCount: urls.length, urls },
			};
		},
	});

	pi.registerTool({
		name: "web_research",
		label: "Web Research",
		description: "Conduct deep research on a topic. Tavily runs multiple searches, cross-references sources, and returns a synthesized report. Takes longer than web_search — use when thorough coverage matters.",
		parameters: webResearchSchema,
		async execute(_toolCallId, params, signal) {
			const query = String(params.query ?? "").trim();
			if (!query) throw new Error("Query cannot be empty.");

			const maxWait = clampNumber(params.timeout, 10, 300, 120);

			// Create research task
			const task = await tavilyPost("/research", { query }, 30, signal);
			const requestId = firstString(task?.request_id, task?.requestId, task?.id);
			if (!requestId) throw new Error("Tavily did not return a request ID for the research task.");

			// Poll until complete
			const pollIntervalMs = 3000;
			const deadline = Date.now() + maxWait * 1000;
			let result: any = task;

			while (result?.status !== "completed" && result?.status !== "failed") {
				if (signal?.aborted) throw new Error("Research cancelled.");
				if (Date.now() >= deadline) throw new Error(`Research timed out after ${maxWait}s. Request ID: ${requestId}`);

				await sleep(pollIntervalMs);
				result = await tavilyGet(`/research/${requestId}`, 30, signal);
			}

			if (result?.status === "failed") {
				throw new Error(`Research failed: ${firstString(result?.error, result?.message) ?? "unknown error"}`);
			}

			const report = firstString(result?.report, result?.content, result?.answer, result?.result) ?? "(no report returned)";
			const sources: string[] = Array.isArray(result?.sources) ? result.sources.map((s: any) => firstString(s?.url, s) ?? "").filter(Boolean) : [];

			const lines: string[] = [];
			lines.push(`Research: ${query}`);
			lines.push("");
			lines.push(report);
			if (sources.length > 0) {
				lines.push("");
				lines.push("Sources:");
				sources.forEach((s) => lines.push(`- ${s}`));
			}

			const output = withOutputLimit("web-research", lines.join("\n"));
			return {
				content: [{ type: "text", text: output.text }],
				details: { query, requestId, sourceCount: sources.length, sources },
			};
		},
	});
}

async function tavilyGet(
	path: string,
	timeoutSeconds: number,
	signal?: AbortSignal,
): Promise<any> {
	const apiKey = getTavilyApiKey();
	if (!apiKey) throw new Error("Tavily API key not configured.");

	const timeoutMs = timeoutSeconds * 1000;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
	const parentAbort = () => controller.abort(signal?.reason ?? new Error("aborted"));
	if (signal) signal.addEventListener("abort", parentAbort, { once: true });

	try {
		const response = await fetch(`${TAVILY_BASE_URL}${path}`, {
			method: "GET",
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: controller.signal,
		});

		const raw = await response.text();
		let data: any;
		try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }

		if (!response.ok) {
			const message = firstString(data?.error?.message, data?.error, data?.message, data?.detail, raw) || "Request failed";
			throw new Error(`Tavily API error (${response.status} ${response.statusText}): ${truncateText(message, 300)}`);
		}
		return data;
	} catch (error: any) {
		if (signal?.aborted) throw new Error("Tavily request cancelled.");
		if (controller.signal.aborted) throw new Error(`Tavily request timed out after ${timeoutSeconds}s.`);
		throw new Error(`Tavily request failed: ${error?.message || "Unknown error"}`);
	} finally {
		clearTimeout(timeoutId);
		if (signal) signal.removeEventListener("abort", parentAbort);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tavilyPost(
	path: string,
	body: Record<string, unknown>,
	timeoutSeconds: number,
	signal?: AbortSignal,
): Promise<any> {
	const apiKey = getTavilyApiKey();
	if (!apiKey) {
		throw new Error(
			"Tavily API key not configured. Set TAVILY_API_KEY in your shell or add tavilyApiKey to ~/.pi/web-search.json.",
		);
	}

	const timeoutMs = timeoutSeconds * 1000;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);

	const parentAbort = () => controller.abort(signal?.reason ?? new Error("aborted"));
	if (signal) signal.addEventListener("abort", parentAbort, { once: true });

	try {
		const response = await fetch(`${TAVILY_BASE_URL}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		const raw = await response.text();
		let data: any;
		try {
			data = raw ? JSON.parse(raw) : {};
		} catch {
			data = { message: raw };
		}

		if (!response.ok) {
			const message =
				firstString(data?.error?.message, data?.error, data?.message, data?.detail, raw) || "Request failed";
			throw new Error(`Tavily API error (${response.status} ${response.statusText}): ${truncateText(message, 300)}`);
		}

		return data;
	} catch (error: any) {
		if (signal?.aborted) {
			throw new Error("Tavily request cancelled.");
		}
		if (controller.signal.aborted) {
			throw new Error(`Tavily request timed out after ${timeoutSeconds}s.`);
		}
		throw new Error(`Tavily request failed: ${error?.message || "Unknown error"}`);
	} finally {
		clearTimeout(timeoutId);
		if (signal) signal.removeEventListener("abort", parentAbort);
	}
}

function getTavilyApiKey(): string | undefined {
	const fromEnv = firstString(process.env.TAVILY_API_KEY, process.env.TAVILY_KEY);
	if (fromEnv) return fromEnv;

	if (!existsSync(CONFIG_PATH)) return undefined;

	try {
		const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
		const directKey = firstString(
			parsed?.tavilyApiKey,
			parsed?.tavily_api_key,
			parsed?.tavily?.apiKey,
			parsed?.apiKey,
			parsed?.key,
		);
		if (directKey) return directKey;

		const legacyKey = firstString(parsed?.geminiApiKey);
		if (legacyKey?.startsWith("tvly-")) return legacyKey;
		return undefined;
	} catch {
		return undefined;
	}
}

function withOutputLimit(stem: string, text: string): TavilyOutputEnvelope {
	const truncation = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
	if (!truncation.truncated) return { text: truncation.content };

	const tempDir = mkdtempSync(join(tmpdir(), "pi-tavily-"));
	const fullOutputPath = join(tempDir, `${stem}.txt`);
	writeFileSync(fullOutputPath, text, "utf8");

	let truncatedText = truncation.content;
	truncatedText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
	truncatedText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
	truncatedText += ` Full output saved to: ${fullOutputPath}]`;

	return {
		text: truncatedText,
		truncation,
		fullOutputPath,
	};
}

function normalizeSearchResults(input: unknown): Array<{ title: string; url: string; score?: number; content: string }> {
	if (!Array.isArray(input)) return [];
	return input.map((item: any) => {
		const title = firstString(item?.title, item?.url, "(untitled)") || "(untitled)";
		const url = firstString(item?.url, item?.link, "") || "";
		const score = typeof item?.score === "number" ? item.score : undefined;
		const content = firstString(item?.content, item?.snippet, item?.raw_content, "") || "";
		return {
			title,
			url,
			score,
			content: truncateText(content, 2000),
		};
	});
}

function normalizeExtractSuccess(input: unknown): Array<{ url: string; title: string; content: string }> {
	if (!Array.isArray(input)) return [];
	return input
		.map((item: any) => {
			const url = firstString(item?.url, item?.source, "") || "";
			if (!url) return null;
			const title = firstString(item?.title, item?.url, "(untitled)") || "(untitled)";
			const content = firstString(item?.raw_content, item?.content, item?.text, "") || "";
			return {
				url,
				title,
				content: truncateText(content, 8000),
			};
		})
		.filter(Boolean) as Array<{ url: string; title: string; content: string }>;
}

function normalizeExtractFailed(input: unknown): Array<{ url: string; error: string }> {
	if (!Array.isArray(input)) return [];
	return input
		.map((item: any) => {
			const url = firstString(item?.url, item?.source, "") || "";
			if (!url) return null;
			const error = firstString(item?.error, item?.message, "Unknown error") || "Unknown error";
			return { url, error: truncateText(error, 220) };
		})
		.filter(Boolean) as Array<{ url: string; error: string }>;
}

function splitAndValidateUrls(
	url: unknown,
	urls: unknown,
): { validUrls: string[]; invalidUrls: Array<{ url: string; error: string }> } {
	const rawUrls = new Set<string>();
	const invalidUrls: Array<{ url: string; error: string }> = [];

	if (typeof url === "string" && url.trim()) rawUrls.add(url.trim());
	if (Array.isArray(urls)) {
		for (const item of urls) {
			if (typeof item === "string" && item.trim()) rawUrls.add(item.trim());
		}
	}

	const validUrls: string[] = [];
	for (const candidate of rawUrls) {
		try {
			const parsed = new URL(candidate);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				invalidUrls.push({ url: candidate, error: "Only http(s) URLs are supported" });
				continue;
			}
			validUrls.push(parsed.toString());
		} catch {
			invalidUrls.push({ url: candidate, error: "Invalid URL" });
		}
	}

	return { validUrls, invalidUrls };
}

function toNonEmptyStrings(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
}

function oneOf<const T extends readonly string[]>(value: unknown, choices: T, fallback: T[number]): T[number] {
	return typeof value === "string" && (choices as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

function oneOfOptional<const T extends readonly string[]>(value: unknown, choices: T): T[number] | undefined {
	return typeof value === "string" && (choices as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== "number" || Number.isNaN(value)) return fallback;
	return Math.min(max, Math.max(min, Math.round(value)));
}

function clampNumberOptional(value: unknown, min: number, max: number): number | undefined {
	if (typeof value !== "number" || Number.isNaN(value)) return undefined;
	return Math.min(max, Math.max(min, Math.round(value)));
}

function truncateText(value: string, maxChars: number): string {
	if (!value) return "";
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, maxChars - 1)}…`;
}

function firstString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed) return trimmed;
		}
	}
	return undefined;
}
