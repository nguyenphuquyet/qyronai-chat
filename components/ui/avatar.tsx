"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

const tones = [
  {
    background: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  { background: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200" },
  {
    background: "bg-indigo-50",
    text: "text-indigo-700",
    ring: "ring-indigo-200",
  },
  { background: "bg-pink-50", text: "text-pink-700", ring: "ring-pink-200" },
  { background: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" },
  {
    background: "bg-violet-50",
    text: "text-violet-700",
    ring: "ring-violet-200",
  },
];

function toneFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return tones[Math.abs(hash) % tones.length];
}

interface AvatarProps {
  name: string;
  src?: string;
  seed?: string;
  size?: number;
  className?: string;
}

export default function Avatar({
  name,
  src,
  seed,
  size = 32,
  className,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const tone = toneFor(seed ?? name);
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length > 1
      ? words
          .slice(-2)
          .map((word) => word.charAt(0))
          .join("")
          .toLocaleUpperCase("vi")
      : (words[0]?.charAt(0) ?? "?").toLocaleUpperCase("vi");

  if (src && !failed) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-black/5",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1",
        tone.background,
        tone.text,
        tone.ring,
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * (initials.length > 1 ? 0.34 : 0.42),
      }}
    >
      {initials}
    </span>
  );
}
