import { Button, Description, Dropdown, Label } from '@heroui/react';
import type { ModelInfo, ReasoningCapability } from '@shipyard/session';
import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export interface ModelConfig {
  id: string;
  label: string;
  description: string;
  reasoning?: ReasoningCapability;
}

const FALLBACK_MODELS: ModelConfig[] = [
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    description: 'Most capable, deep reasoning',
    reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5',
    description: 'Fast and balanced',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    description: 'Fastest responses',
  },
];

export interface ModelPickerProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  models: ModelConfig[];
}

export function ModelPicker({ selectedModelId, onModelChange, models }: ModelPickerProps) {
  const selectedKeys = useMemo(() => new Set([selectedModelId]), [selectedModelId]);

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const displayLabel = selectedModel?.label ?? models[0]?.label ?? 'Claude Opus 4.6';

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

function mapModels(availableModels?: ModelInfo[]): ModelConfig[] {
  if (availableModels && availableModels.length > 0) {
    return availableModels.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.provider,
      reasoning: m.reasoning,
    }));
  }
  return FALLBACK_MODELS;
}

export function useModelPicker(availableModels?: ModelInfo[]) {
  const [selectedModelId, setSelectedModelId] = useState('claude-opus-4-6');

  useEffect(() => {
    if (!availableModels || availableModels.length === 0) {
      setSelectedModelId('claude-opus-4-6');
      return;
    }
    setSelectedModelId((prev) => {
      if (availableModels.some((m) => m.id === prev)) return prev;
      return availableModels[0]?.id ?? prev;
    });
  }, [availableModels]);

  const models = useMemo(() => mapModels(availableModels), [availableModels]);

  const selectedModel = models.find((m) => m.id === selectedModelId);
  return {
    selectedModelId,
    setSelectedModelId,
    models,
    reasoning: selectedModel?.reasoning,
  };
}
