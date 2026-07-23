/**
 * Vision Sidecar Extension
 *
 * Routes image files through a cheap vision model (Gemini 3.1 Flash-Lite via
 * orcarouter) instead of the main conversation model, which may not support
 * images. Exposes a `see` tool and falls back to intercepting `read` calls on
 * image files.
 *
 * The vision model is resolved through `ctx.modelRegistry` by provider+id, so
 * this works no matter which model is currently active as the main model.
 */

import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { Type } from "typebox";

const VISION_PROVIDER = "orcarouter";
const VISION_MODEL_ID = "google/gemini-3.1-flash-lite-preview";

const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".bmp",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".bmp": "image/bmp",
};

function isImagePath(path: string): boolean {
	return IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

function mimeForPath(path: string): string {
	return MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** Marker pi emits when read() is given an image on a non-vision model. */
const IMAGE_OMITTED_MARKER = "model does not support images";

export default function (pi: ExtensionAPI) {
	// Resolve the vision model up front. Falls back gracefully if not configured.
	function resolveVisionModel(ctx: { modelRegistry: ExtensionAPI extends never ? never : any }) {
		return ctx.modelRegistry.find(VISION_PROVIDER, VISION_MODEL_ID);
	}

	async function describeImage(
		path: string,
		question: string | undefined,
		signal: AbortSignal | undefined,
		ctx: any,
	): Promise<string> {
		const model = resolveVisionModel(ctx);
		if (!model) {
			throw new Error(
				`Vision model ${VISION_PROVIDER}/${VISION_MODEL_ID} not found. Add it to models.json.`,
			);
		}
		if (!model.input?.includes("image")) {
			throw new Error(`Model ${model.id} is not declared with image input.`);
		}

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || !auth.apiKey) {
			throw new Error(
				auth.ok ? `No API key for ${model.provider}` : `Auth failed: ${auth.error}`,
			);
		}

		const absolute = resolve(ctx.cwd, path);
		const data = await readFile(absolute);
		const base64 = data.toString("base64");
		const mimeType = mimeForPath(path);

		const prompt = question?.trim()
			? `Look at this image and answer concisely. Question: ${question.trim()}`
			: "Describe this image in detail. Include any visible text verbatim, UI elements, values, labels, and spatial layout. Be precise and factual.";

		const response = await complete(
			model,
			{
				messages: [
					{
						role: "user",
						content: [
							{ type: "image", data: base64, mimeType },
							{ type: "text", text: prompt },
						],
						timestamp: Date.now(),
					},
				],
			},
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				env: auth.env,
				maxTokens: 4096,
				signal,
			},
		);

		const text = response.content
			.filter((c: any): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n")
			.trim();

		if (!text) {
			if (response.stopReason === "aborted") throw new Error("aborted");
			throw new Error("Vision model returned empty description");
		}
		return text;
	}

	// --- Tool: see ----------------------------------------------------------
	pi.registerTool({
		name: "see",
		label: "View image",
		description:
			"View an image file (png/jpg/jpeg/gif/webp/bmp) via a vision-capable sidecar model. Use this instead of `read` for any image file — `read` cannot display images to the model and will return a placeholder. Accepts an optional question to answer about the image.",
		promptSnippet: "View image files (png/jpg/gif/webp/bmp) via vision sidecar",
		promptGuidelines: [
			"Use `see` instead of `read` for image files (png/jpg/jpeg/gif/webp/bmp). `read` cannot show images and returns a placeholder; `see` routes the image through a vision model.",
		],
		parameters: Type.Object({
			path: Type.String({ description: "Path to the image file (relative or absolute)." }),
			question: Type.Optional(
				Type.String({
					description:
						"Optional specific question to answer about the image. If omitted, returns a detailed description.",
				}),
			),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const path = String(params.path ?? "").replace(/^@/, "");
			if (!path) {
				return {
					content: [{ type: "text", text: "Error: `path` is required." }],
					isError: true,
				};
			}
			if (!isImagePath(path)) {
				return {
					content: [
						{
							type: "text",
							text: `Error: \`${path}\` is not a supported image file. Supported: ${[...IMAGE_EXTENSIONS].join(", ")}.`,
						},
					],
					isError: true,
				};
			}

			onUpdate?.({ content: [{ type: "text", text: `Viewing ${path}…` }] });

			try {
				const description = await describeImage(path, params.question, signal, ctx);
				return {
					content: [
						{
							type: "text",
							text: `Image: ${path}\n\n${description}`,
						},
					],
					details: { path, question: params.question ?? null },
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error viewing image: ${message}` }],
					isError: true,
				};
			}
		},
	});

	// --- Fallback: intercept read() on image files --------------------------
	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "read") return;
		const path = String((event.input as { path?: string })?.path ?? "").replace(/^@/, "");
		if (!path || !isImagePath(path)) return;

		// Only intercept when read() bailed because the active model lacks vision.
		const textParts = (event.content ?? [])
			.filter((c: any): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text);
		const joined = textParts.join("\n");
		if (!joined.includes(IMAGE_OMITTED_MARKER)) return;

		try {
			const description = await describeImage(path, undefined, ctx.signal, ctx);
			return {
				content: [
					{
						type: "text",
						text: `read() cannot display images on the current model. Routed ${path} through vision sidecar:\n\n${description}`,
					},
				],
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				content: [
					{
						type: "text",
						text: `read() cannot display images on the current model, and vision sidecar failed: ${message}`,
					},
				],
				isError: true,
			};
		}
	});
}
