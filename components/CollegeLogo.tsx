"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";

/** Put the college logo at public/gcs-logo.png. Until it exists, a book icon is shown instead. */
export const COLLEGE_LOGO_SRC = "/gcs-logo.png";

export function CollegeLogo() {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // The image may fail before React hydrates (onError would be missed), so check once on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <div className="bg-blue-600 p-2.5 rounded-xl mt-0.5 shrink-0">
        <BookOpen className="w-6 h-6 text-white" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={COLLEGE_LOGO_SRC}
      alt="Govt. Graduate College of Science, Lahore"
      onError={() => setFailed(true)}
      className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white p-1 object-contain shrink-0 shadow-md"
    />
  );
}
