import { Spinner } from "@heroui/react";
import { Avatar } from "@/components/ui/avatar";
import type { GitHubIdentity } from "@/hooks/useGitHubAuth";

interface UserProfileButtonProps {
	identity: GitHubIdentity;
	isValidating: boolean;
	collapsed?: boolean;
}

export function UserProfileButton({
	identity,
	isValidating,
	collapsed,
}: UserProfileButtonProps) {
	if (collapsed) {
		return (
			<div className="relative">
				<Avatar size="sm" className={isValidating ? "opacity-50" : ""}>
					<Avatar.Image src={identity.avatarUrl} alt={identity.username} />
					<Avatar.Fallback>
						{identity.username[0]?.toUpperCase() ?? "?"}
					</Avatar.Fallback>
				</Avatar>
				{isValidating && (
					<div className="absolute inset-0 flex items-center justify-center">
						<Spinner size="sm" />
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-elevated transition-colors w-full">
			<Avatar size="sm" className={isValidating ? "opacity-50" : ""}>
				<Avatar.Image src={identity.avatarUrl} alt={identity.username} />
				<Avatar.Fallback>
					{identity.username[0]?.toUpperCase() ?? "?"}
				</Avatar.Fallback>
			</Avatar>
			<span className="text-sm truncate flex-1 text-left">
				{identity.username}
			</span>
			{isValidating && <Spinner size="sm" />}
		</div>
	);
}
