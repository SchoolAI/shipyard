/**
 * Success alert shown when agent is launched successfully.
 */

import { Alert, Link } from "@heroui/react";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { getPlanRoute } from "@/constants/routes";

interface SuccessAlertProps {
	/** Success info containing pid and planId */
	successInfo: { pid: number; planId: string };
	/** Variant of success (agent launched vs plan created) */
	variant: "agent-launched" | "plan-created";
}

/**
 * Alert shown when agent launch or plan creation succeeds.
 * Displays different messaging based on variant.
 */
export function SuccessAlert({ successInfo, variant }: SuccessAlertProps) {
	const isAgentLaunched = variant === "agent-launched";

	return (
		<div className="animate-in zoom-in-95 fade-in duration-300">
			<Alert
				status="success"
				className="border-2 border-success/30 shadow-lg shadow-success/10"
			>
				<Alert.Indicator>
					<CheckCircle2 className="w-5 h-5 text-success animate-in spin-in-180 duration-500" />
				</Alert.Indicator>
				<Alert.Content>
					<Alert.Title className="text-lg font-semibold">
						{isAgentLaunched ? "Agent launched!" : "Task created!"}
					</Alert.Title>
					<Alert.Description className="text-muted-foreground">
						{isAgentLaunched
							? `Running with PID ${successInfo.pid}`
							: "Your task is ready. Connect from a desktop to launch an agent."}
					</Alert.Description>
					<div className="mt-2">
						<Link
							href={`${window.location.origin}${getPlanRoute(successInfo.planId)}`}
							target="_blank"
							className="text-sm text-accent hover:text-accent/80 underline-offset-2 hover:underline"
						>
							Open {isAgentLaunched ? "plan" : "task"}
							<Link.Icon className="ml-1 size-3">
								<ExternalLink />
							</Link.Icon>
						</Link>
					</div>
				</Alert.Content>
			</Alert>
		</div>
	);
}
