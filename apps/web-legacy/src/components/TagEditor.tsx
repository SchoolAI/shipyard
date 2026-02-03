import { ComboBox, Input, Label, ListBox } from "@heroui/react";
import type { PlanIndexEntry } from "@shipyard/schema";
import { getAllTagsFromIndex } from "@shipyard/schema";
import { useState } from "react";
import { TagChip } from "./TagChip";

interface TagEditorProps {
	tags: string[];
	onTagsChange: (tags: string[]) => void;
	/** All plans for autocomplete suggestions */
	allPlans: PlanIndexEntry[];
}

export function TagEditor({ tags, onTagsChange, allPlans }: TagEditorProps) {
	const [inputValue, setInputValue] = useState("");
	const existingTags = getAllTagsFromIndex(allPlans);

	const handleAddTag = (tag: string) => {
		const normalized = tag.toLowerCase().trim();
		if (normalized && !tags.includes(normalized)) {
			onTagsChange([...tags, normalized]);
		}
		setInputValue("");
	};

	const handleRemoveTag = (tagToRemove: string) => {
		onTagsChange(tags.filter((t) => t !== tagToRemove));
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && inputValue.trim()) {
			e.preventDefault();
			handleAddTag(inputValue);
		}
	};

	return (
		<div className="space-y-2">
			<ComboBox
				inputValue={inputValue}
				onInputChange={setInputValue}
				onSelectionChange={(key) => {
					if (key) handleAddTag(String(key));
				}}
				allowsCustomValue
			>
				<Label>Tags</Label>
				<ComboBox.InputGroup>
					<Input
						placeholder="Add tags (e.g., ui, bug, project:mobile-app)"
						onKeyDown={handleKeyDown}
					/>
				</ComboBox.InputGroup>
				<ComboBox.Popover>
					<ListBox>
						{existingTags
							.filter((tag) => !tags.includes(tag))
							.map((tag) => (
								<ListBox.Item key={tag} textValue={tag}>
									<TagChip tag={tag} />
								</ListBox.Item>
							))}
					</ListBox>
				</ComboBox.Popover>
			</ComboBox>

			{tags.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{tags.map((tag) => (
						<TagChip
							key={tag}
							tag={tag}
							removable
							onRemove={() => handleRemoveTag(tag)}
						/>
					))}
				</div>
			)}
		</div>
	);
}
