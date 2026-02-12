import { Dropdown, Label } from '@heroui/react';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';

interface ModelConfig {
  id: string;
  label: string;
  supportsReasoning: boolean;
}

const MODELS: ModelConfig[] = [
  { id: 'claude-code', label: 'claude-code', supportsReasoning: true },
  { id: 'claude-opus', label: 'claude-opus', supportsReasoning: true },
  { id: 'claude-sonnet', label: 'claude-sonnet', supportsReasoning: false },
];

export interface ModelPickerProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
}

export function ModelPicker({ selectedModelId, onModelChange }: ModelPickerProps) {
  const selectedKeys = useMemo(() => new Set([selectedModelId]), [selectedModelId]);

  const selectedModel = MODELS.find((m) => m.id === selectedModelId);
  const displayLabel = selectedModel?.label ?? 'claude-code';

  return (
    <Dropdown>
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
      >
        {displayLabel}
        <ChevronDown className="w-3 h-3" />
      </button>
      <Dropdown.Popover placement="top start" className="min-w-[180px]">
        <Dropdown.Menu
          selectionMode="single"
          selectedKeys={selectedKeys}
          onSelectionChange={(keys) => {
            const selected = [...keys][0];
            if (typeof selected === 'string') {
              onModelChange(selected);
            }
          }}
        >
          {MODELS.map((model) => (
            <Dropdown.Item key={model.id} id={model.id} textValue={model.label}>
              <Label>{model.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function useModelPicker() {
  const [selectedModelId, setSelectedModelId] = useState('claude-code');
  const selectedModel = MODELS.find((m) => m.id === selectedModelId);
  return {
    selectedModelId,
    setSelectedModelId,
    supportsReasoning: selectedModel?.supportsReasoning ?? false,
  };
}
