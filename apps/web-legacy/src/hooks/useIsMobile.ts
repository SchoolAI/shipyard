import { useEffect, useState } from "react";

/** Breakpoint matching Tailwind's `md:` (768px) */
const MOBILE_BREAKPOINT = 768;

/**
 * Hook to detect mobile viewport (< 768px).
 * Uses matchMedia for efficient updates without resize event listeners.
 */
export function useIsMobile(): boolean {
	const [isMobile, setIsMobile] = useState(() => {
		/** SSR-safe: default to false, will update on mount */
		if (typeof window === "undefined") return false;
		return window.innerWidth < MOBILE_BREAKPOINT;
	});

	useEffect(() => {
		const mediaQuery = window.matchMedia(
			`(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
		);

		/** Set initial value */
		setIsMobile(mediaQuery.matches);

		/** Listen for changes */
		const handler = (event: MediaQueryListEvent) => {
			setIsMobile(event.matches);
		};

		mediaQuery.addEventListener("change", handler);
		return () => mediaQuery.removeEventListener("change", handler);
	}, []);

	return isMobile;
}
