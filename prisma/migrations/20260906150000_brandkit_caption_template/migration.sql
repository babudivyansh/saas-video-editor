-- Let a Brand Kit carry a premium caption style, not just ASS field values.
--
-- captionTemplateId holds a Clipiro template slug (e.g. "viral-bold-01"), so
-- saving a brand style captures which LOOK was chosen — including a
-- provider-rendered one. Previously a kit could only describe the native
-- renderer's vocabulary (font, colours, outline), which meant a premium style
-- was un-saveable.
--
-- providerPresetId is a seam for provider-specific presets / custom themes.
-- Nothing writes it yet; it exists so that support does not require a
-- migration later, and so nobody is tempted to overload captionTemplateId
-- with two different meanings.
ALTER TABLE "BrandKit" ADD COLUMN "captionTemplateId" TEXT;
ALTER TABLE "BrandKit" ADD COLUMN "providerPresetId" TEXT;
