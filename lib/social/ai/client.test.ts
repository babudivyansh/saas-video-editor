import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const generateContent = vi.fn();
const getGenerativeModel = vi.fn(() => ({ generateContent }));

vi.mock("@google/generative-ai", () => ({
  // A class, not an arrow: the client calls `new GoogleGenerativeAI(...)`.
  GoogleGenerativeAI: class {
    getGenerativeModel = getGenerativeModel;
  },
}));
vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "test-key" } }));

const { AiValidationError, buildPrompt, generateStructured, toGeminiSchema } = await import("./client");

const schema = z.object({ metric: z.enum(["views", "reach"]), note: z.string() });
const responseSchema = z.toJSONSchema(schema);

const reply = (text: string) => ({ response: { text: () => text } });

beforeEach(() => {
  generateContent.mockReset();
  getGenerativeModel.mockClear();
});

describe("toGeminiSchema", () => {
  it("strips the JSON Schema keys the SDK rejects", () => {
    const out = toGeminiSchema(responseSchema) as Record<string, unknown>;
    expect(out.$schema).toBeUndefined();
    expect(out.additionalProperties).toBeUndefined();
    expect(out.type).toBe("object");
  });

  it("flattens zod's nullable anyOf into a nullable field", () => {
    const out = toGeminiSchema(z.toJSONSchema(z.object({ metric: z.enum(["views"]).nullable() }))) as {
      properties: { metric: Record<string, unknown> };
    };
    expect(out.properties.metric.anyOf).toBeUndefined();
    expect(out.properties.metric.nullable).toBe(true);
    expect(out.properties.metric.enum).toEqual(["views"]);
  });

  it("recurses into arrays and nested objects", () => {
    const nested = z.object({ items: z.array(z.object({ note: z.string() })) });
    const out = toGeminiSchema(z.toJSONSchema(nested)) as {
      properties: { items: { items: Record<string, unknown> } };
    };
    expect(out.properties.items.items.additionalProperties).toBeUndefined();
  });
});

describe("buildPrompt", () => {
  it("puts the grounding rule ahead of the facts", () => {
    const prompt = buildPrompt({
      role: "You are a growth coach.",
      task: "Summarise the week.",
      facts: { kind: "account", lines: ["Followers: 1.1K"] },
    });
    expect(prompt.indexOf("never invent")).toBeLessThan(prompt.indexOf("FACTS:"));
    expect(prompt).toContain("Followers: 1.1K");
    expect(prompt).toContain("Summarise the week.");
  });
});

describe("generateStructured", () => {
  it("requests JSON mode with the converted schema", async () => {
    generateContent.mockResolvedValue(reply('{"metric":"views","note":"up"}'));
    const out = await generateStructured({ schema, responseSchema, prompt: "p" });

    expect(out).toEqual({ metric: "views", note: "up" });
    const config = getGenerativeModel.mock.calls[0][0] as {
      generationConfig: { responseMimeType: string; responseSchema: Record<string, unknown> };
    };
    expect(config.generationConfig.responseMimeType).toBe("application/json");
    expect(config.generationConfig.responseSchema.$schema).toBeUndefined();
  });

  it("tolerates the markdown fences the model adds despite instructions", async () => {
    generateContent.mockResolvedValue(reply('```json\n{"metric":"reach","note":"flat"}\n```'));
    await expect(generateStructured({ schema, responseSchema, prompt: "p" })).resolves.toEqual({
      metric: "reach",
      note: "flat",
    });
  });

  it("throws AiValidationError when the reply is not JSON", async () => {
    generateContent.mockResolvedValue(reply("I'm sorry, I can't help with that."));
    await expect(generateStructured({ schema, responseSchema, prompt: "p", maxAttempts: 1 })).rejects.toBeInstanceOf(
      AiValidationError,
    );
  });

  it("throws AiValidationError when the model names a metric that does not exist", async () => {
    // The refund path depends on this throwing rather than returning a
    // best-effort object with an invented metric name in it.
    generateContent.mockResolvedValue(reply('{"metric":"virality","note":"made up"}'));
    const err = await generateStructured({ schema, responseSchema, prompt: "p", maxAttempts: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(AiValidationError);
    expect((err as Error).message).toContain("metric");
  });

  it("retries a transient provider failure", async () => {
    generateContent
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce(reply('{"metric":"views","note":"ok"}'));
    await expect(generateStructured({ schema, responseSchema, prompt: "p" })).resolves.toMatchObject({ metric: "views" });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("passes an AbortSignal so a hung call is actually cancelled", async () => {
    generateContent.mockResolvedValue(reply('{"metric":"views","note":"ok"}'));
    await generateStructured({ schema, responseSchema, prompt: "p" });
    expect(generateContent.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
