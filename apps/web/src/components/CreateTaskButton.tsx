/**
 * Button for creating new tasks / starting agents.
 * Renders differently for expanded vs collapsed sidebar.
 */

import { Button, Tooltip } from "@heroui/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { StartAgentModal } from "./StartAgentModal";

interface CreateTaskButtonProps {
	collapsed: boolean;
}

/**
 * Button for creating new tasks via agent launcher.
 * Shows full button in expanded sidebar, icon-only in collapsed sidebar.
 */
export function CreateTaskButton({ collapsed }: CreateTaskButtonProps) {
	const [isModalOpen, setIsModalOpen] = useState(false);

	const openModal = () => setIsModalOpen(true);
	const closeModal = () => setIsModalOpen(false);

	if (collapsed) {
		return (
			<>
				<Tooltip>
					<Tooltip.Trigger>
						<Button
							isIconOnly
							variant="primary"
							onPress={openModal}
							aria-label="Create Task"
							className="w-10 h-10"
						>
							<Plus className="w-5 h-5" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>Create Task</Tooltip.Content>
				</Tooltip>
				<StartAgentModal isOpen={isModalOpen} onClose={closeModal} />
			</>
		);
	}

	return (
		<>
			<Button variant="primary" onPress={openModal} className="w-full">
				<Plus className="w-4 h-4" />
				Create Task
			</Button>
			<StartAgentModal isOpen={isModalOpen} onClose={closeModal} />
		</>
	);
}
