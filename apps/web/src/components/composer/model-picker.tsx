import { Button, Description, Dropdown, Label } from '@heroui/react';
import type { ModelInfo } from '@shipyard/session';
import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface ModelConfig {
  id: string;
  label: string;
  description: string;
  supportsReasoning: boolean;
}

const FALLBACK_MODELS: ModelConfig[] = [
  {
    id: 'claude-code',
    label: 'claude-code',
    description: 'Optimized for coding tasks',
    supportsReasoning: true,
  },
  {
    id: 'claude-opus',
    label: 'claude-opus',
    description: 'Most capable, deep reasoning',
    supportsReasoning: true,
  },
  {
    id: 'claude-sonnet',
    label: 'claude-sonnet',
    description: 'Fast and balanced',
    supportsReasoning: false,
  },
];

export interface ModelPickerProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  availableModels?: ModelInfo[];
}

export function ModelPicker({ selectedModelId, onModelChange, availableModels }: ModelPickerProps) {
  const models: ModelConfig[] = useMemo(() => {
    if (availableModels && availableModels.length > 0) {
      return availableModels.map((m) => ({
        id: m.id,
        label: m.label,
        description: m.provider,
        supportsReasoning: m.supportsReasoning,
      }));
    }
    return FALLBACK_MODELS;
  }, [availableModels]);

  const selectedKeys = useMemo(() => new Set([selectedModelId]), [selectedModelId]);

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const displayLabel = selectedModel?.label ?? models[0]?.label ?? 'claude-code';

  return (
    <Dropdown>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Model: ${displayLabel}`}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted hover:text-foreground hover:bg-default transition-colors"
      >
        {displayLabel}
        <ChevronDown className="w-3 h-3" />
      </Button>
      <Dropdown.Popover placement="top start" className="min-w-[220px]">
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
          {models.map((model) => (
            <Dropdown.Item key={model.id} id={model.id} textValue={model.label}>
              <Label>{model.label}</Label>
              <Description>{model.description}</Description>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function useModelPicker(availableModels?: ModelInfo[]) {
  const [selectedModelId, setSelectedModelId] = useState('claude-code');

  useEffect(() => {
    if (!availableModels || availableModels.length === 0) {
      setSelectedModelId('claude-code');
      return;
    }
    if (!availableModels.some((m) => m.id === selectedModelId)) {
      const firstModel = availableModels[0];
      if (firstModel) {
        setSelectedModelId(firstModel.id);
      }
    }
  }, [availableModels, selectedModelId]);

  const models: ModelConfig[] = useMemo(() => {
    if (availableModels && availableModels.length > 0) {
      return availableModels.map((m) => ({
        id: m.id,
        label: m.label,
        description: m.provider,
        supportsReasoning: m.supportsReasoning,
      }));
    }
    return FALLBACK_MODELS;
  }, [availableModels]);

  const selectedModel = models.find((m) => m.id === selectedModelId);
  return {
    selectedModelId,
    setSelectedModelId,
    supportsReasoning: selectedModel?.supportsReasoning ?? false,
  };
}
