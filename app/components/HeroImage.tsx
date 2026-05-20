import Image from "next/image";

function HeroImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      width={1024}
      height={128}
      src={src}
      alt={alt}
      className="w-full aspect-2.5/1 object-cover"
      priority
    />
  );
}

export default HeroImage;
