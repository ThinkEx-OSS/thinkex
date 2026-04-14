"use client";

import { useEffect, useState } from "react";

const MOBILE_UA_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i;

export function useIsMobileDevice(): boolean {
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isMobileUA = MOBILE_UA_REGEX.test(ua);
    const isIPad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;

    setIsMobileDevice(isMobileUA || isIPad);
  }, []);

  return isMobileDevice;
}
