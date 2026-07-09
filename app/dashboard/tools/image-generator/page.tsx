import ImageGeneratorTool from "@/app/components/ImageGeneratorTool";

export default function ImageGeneratorPage() {
  return (
    <>
      <div className="mx-auto w-full max-w-[1440px] px-8 pt-6 pb-2">
        <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">AI Image Generator</h1>
        <p className="text-[13.5px] text-gray-500 mt-1">Generate stunning images from text prompts using state-of-the-art AI models.</p>
      </div>
      <ImageGeneratorTool />
    </>
  );
}
