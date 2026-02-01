/**
 * Hook to manage InputRequestModal open/close state and event handling.
 * Listens for 'open-input-request' custom events to open the modal.
 */

import { type InputRequest, InputRequestSchema } from "@shipyard/schema";
import { useEffect, useState } from "react";

/** Return type for the useInputRequestModal hook */
export interface UseInputRequestModalReturn {
	/** Whether the modal is open */
	isOpen: boolean;
	/** Current input request being displayed */
	currentRequest: InputRequest | null;
	/** Close the modal and clear the request */
	closeModal: () => void;
}

/**
 * Hook for managing the InputRequestModal state.
 * Listens for custom 'open-input-request' events dispatched by useInputRequests.
 */
export function useInputRequestModal(): UseInputRequestModalReturn {
	const [isOpen, setIsOpen] = useState(false);
	const [currentRequest, setCurrentRequest] = useState<InputRequest | null>(
		null,
	);

	/** Listen for 'open-input-request' custom events */
	useEffect(() => {
		let isMounted = true;

		const handleOpenInputRequest = (event: Event) => {
			/** Prevent state updates after component unmounts */
			if (!isMounted) return;

			if (!(event instanceof CustomEvent)) return;
			const result = InputRequestSchema.safeParse(event.detail);
			if (!result.success) return;

			/*
			 * Prevent duplicate opens - if modal is already open with this request, ignore
			 * Note: This only prevents duplicates within a single tab. Multi-tab coordination
			 * would require BroadcastChannel or localStorage, but current UX is acceptable
			 * (user sees "already answered" error if they try to answer in second tab)
			 */
			if (isOpen && currentRequest?.id === result.data.id) {
				return;
			}

			setCurrentRequest(result.data);
			setIsOpen(true);
		};

		document.addEventListener("open-input-request", handleOpenInputRequest);

		return () => {
			isMounted = false;
			document.removeEventListener(
				"open-input-request",
				handleOpenInputRequest,
			);
		};
	}, [isOpen, currentRequest]);

	const closeModal = () => {
		setIsOpen(false);
		setCurrentRequest(null);
	};

	return {
		isOpen,
		currentRequest,
		closeModal,
	};
}
