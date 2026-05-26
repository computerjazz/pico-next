import Image from "next/image";

function HeroImage({
  src,
  alt,
  text,
}: {
  src: string;
  alt: string;
  text?: string;
}) {
  return (
    <div className="relative">
      <Image
        width={1024}
        height={128}
        src={src}
        alt={alt}
        className="w-full aspect-2.5/1 object-cover"
        priority
      />
      {!!text && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center">
          <div className="bg-linear-to-b from-transparent to-black/60 w-full flex items-center justify-center">
            <div className="max-w-large pb-8 pt-8 pl-4 pr-4 text-3xl font-bold text-accent-foreground">
              {text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HeroImage;
