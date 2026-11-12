import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { cn } from "cn";

import { Skeleton } from "@/components/ui/skeleton";

type SkeletonImageProps = React.ComponentProps<"img"> & {
  /** Extra classes for the placeholder shown while the image downloads. */
  skeletonClassName?: string;
};

/**
 * Image that covers itself with a skeleton until the file has loaded.
 * The parent needs `relative` positioning so the placeholder can fill it.
 */
export function SkeletonImage({
  className,
  skeletonClassName,
  src,
  ...props
}: SkeletonImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const image = imageRef.current;

    // Cached images can finish before React attaches `onLoad`, so check the
    // element directly whenever the source changes.
    setIsLoaded(Boolean(image?.complete && image.naturalWidth > 0));
  }, [src]);

  return (
    <>
      {!isLoaded && (
        <Skeleton
          aria-hidden="true"
          className={cn("absolute inset-0 rounded-none", skeletonClassName)}
        />
      )}
      <img
        ref={imageRef}
        src={src}
        {...props}
        onLoad={() => setIsLoaded(true)}
        onError={() => setIsLoaded(true)}
        className={cn(
          "transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  );
}
