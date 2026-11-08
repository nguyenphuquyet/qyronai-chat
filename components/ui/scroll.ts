"use client";

import { useEffect, useRef } from "react";

/**
 * Thanh cuộn tự ẩn (I18): đứng yên thì trong suốt, đang cuộn thì đậm lên
 * trong ~700ms. Class đặt lên chính phần tử cuộn.
 */
export function useAutohideScrollbar<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let timeout = 0;
    const onScroll = () => {
      element.classList.add("is-scrolling");
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        element.classList.remove("is-scrolling");
      }, 700);
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      window.clearTimeout(timeout);
    };
  }, []);

  return ref;
}
