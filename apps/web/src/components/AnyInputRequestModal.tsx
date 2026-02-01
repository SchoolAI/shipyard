/**
 * Wrapper component that renders the appropriate modal based on input request type.
 * Routes between InputRequestModal (single questions) and MultiQuestionInputModal.
 */

import type { AnyInputRequest } from "@shipyard/schema";
import type * as Y from "yjs";
import { InputRequestModal } from "./InputRequestModal";
import { MultiQuestionInputModal } from "./MultiQuestionInputModal";

interface AnyInputRequestModalProps {
	isOpen: boolean;
	request: AnyInputRequest | null;
	ydoc: Y.Doc | null;
	planYdoc?: Y.Doc | null;
	onClose: () => void;
}

export function AnyInputRequestModal({
	isOpen,
	request,
	ydoc,
	planYdoc,
	onClose,
}: AnyInputRequestModalProps) {
	if (request?.type === "multi") {
		return (
			<MultiQuestionInputModal
				isOpen={isOpen}
				request={request}
				ydoc={ydoc}
				planYdoc={planYdoc}
				onClose={onClose}
			/>
		);
	}

	return (
		<InputRequestModal
			isOpen={isOpen}
			request={request}
			ydoc={ydoc}
			planYdoc={planYdoc}
			onClose={onClose}
		/>
	);
}
