/**
 * Dropdown input component for input requests.
 * Uses searchable ComboBox for long option lists.
 */

import { Alert, ComboBox, Input, Label, ListBox } from '@heroui/react';
import { type DropdownInputRequest, normalizeChoiceOptions } from '@shipyard/schema';
import type { BaseInputProps } from './types';

export function DropdownInput({
  request,
  value,
  setValue,
  isSubmitting,
}: BaseInputProps<DropdownInputRequest>) {
  const rawOptions = request.options || [];

  // Show error if no options available
  if (rawOptions.length === 0) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Invalid Request</Alert.Title>
          <Alert.Description>
            This dropdown request has no options available. Please cancel and contact the agent.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  // Normalize options to handle both string[] and object[] formats
  const options = normalizeChoiceOptions(rawOptions);
  const selectedValue = typeof value === 'string' ? value : '';

  return (
    <div className="space-y-3">
      <ComboBox
        selectedKey={selectedValue || null}
        onSelectionChange={(key) => setValue(key ? String(key) : '')}
        isDisabled={isSubmitting}
        isRequired
      >
        <Label className="text-sm font-medium text-foreground">{request.message}</Label>
        <ComboBox.InputGroup>
          <Input placeholder={request.placeholder || 'Select an option...'} autoFocus />
        </ComboBox.InputGroup>
        <ComboBox.Popover>
          <ListBox>
            {options.map((opt) => (
              <ListBox.Item
                key={opt.value}
                id={opt.value}
                textValue={opt.label}
                isDisabled={opt.disabled}
              >
                <div className="flex flex-col">
                  <span>{opt.label}</span>
                  {opt.description && (
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  )}
                </div>
              </ListBox.Item>
            ))}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>
    </div>
  );
}
