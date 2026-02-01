import { Button, Tooltip } from "@heroui/react";
import { LogIn } from "lucide-react";

interface SignInButtonProps {
	collapsed?: boolean;
	onPress: () => void;
}

export function SignInButton({ collapsed, onPress }: SignInButtonProps) {
	if (collapsed) {
		return (
			<Tooltip>
				<Tooltip.Trigger>
					<Button
						isIconOnly
						variant="ghost"
						size="sm"
						onPress={onPress}
						aria-label="Sign in"
						className="w-10 h-10"
					>
						<LogIn className="w-4 h-4" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content>Sign in</Tooltip.Content>
			</Tooltip>
		);
	}

	return (
		<Button
			variant="ghost"
			size="sm"
			onPress={onPress}
			className="w-full justify-start gap-2 px-2"
		>
			<LogIn className="w-4 h-4" />
			<span className="text-sm">Sign in</span>
		</Button>
	);
}
