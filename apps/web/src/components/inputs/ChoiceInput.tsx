/**
 * Choice input component for input requests.
 * Supports single-select (radio buttons) and multi-select (checkboxes).
 * Includes "Other" escape hatch option for custom user responses.
 */

import {
  Alert,
  Checkbox,
  CheckboxGroup,
  Input,
  Label,
  Radio,
  RadioGroup,
  TextField,
} from '@heroui/react';
import { normalizeChoiceOptions } from '@shipyard/schema';
import { useEffect, useRef } from 'react';
import type { ChoiceInputProps } from './types';
import { OTHER_OPTION_LABEL, OTHER_OPTION_VALUE } from './utils';

export function ChoiceInput({
  request,
  value,
  setValue,
  isSubmitting,
  customInput,
  setCustomInput,
  isOtherSelected,
}: ChoiceInputProps) {
  const customInputRef = useRef<HTMLInputElement>(null);
  const rawOptions = request.options || [];

  // Auto-focus custom input when "Other" is selected
  useEffect(() => {
    if (isOtherSelected && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [isOtherSelected]);

  // Show error if no options available
  if (rawOptions.length === 0) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Invalid Request</Alert.Title>
          <Alert.Description>
            This choice request has no options available. Please cancel and contact the agent.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  // Normalize options to handle both string[] (old) and object[] (new) formats
  const options = normalizeChoiceOptions(rawOptions);

  // Render the "Other" text input field (shared between single and multi-select)
  const otherInputField = isOtherSelected && (
    <TextField className="mt-3 ml-6">
      <Label className="text-sm text-muted-foreground">Please specify:</Label>
      <Input
        ref={customInputRef}
        value={customInput}
        onChange={(e) => setCustomInput(e.target.value)}
        placeholder="Type your answer..."
        disabled={isSubmitting}
      />
    </TextField>
  );

  // Multi-select mode with checkboxes
  if (request.multiSelect) {
    return (
      <div className="space-y-3">
        <CheckboxGroup
          isRequired
          value={Array.isArray(value) ? value : []}
          onChange={setValue}
          isDisabled={isSubmitting}
        >
          <Label className="text-sm font-medium text-foreground">{request.message}</Label>
          <p className="text-xs text-muted-foreground mt-1">(Select one or more options)</p>
          {options.map((opt) => (
            <Checkbox key={opt.value} value={opt.value} isDisabled={opt.disabled}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label>{opt.label}</Label>
                {opt.description && (
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                )}
              </Checkbox.Content>
            </Checkbox>
          ))}
          {/* "Other" escape hatch option */}
          <Checkbox value={OTHER_OPTION_VALUE}>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label className="italic">{OTHER_OPTION_LABEL}</Label>
            </Checkbox.Content>
          </Checkbox>
        </CheckboxGroup>
        {otherInputField}
      </div>
    );
  }

  // Single-select mode with radio buttons
  return (
    <div className="space-y-3">
      <RadioGroup
        isRequired
        value={typeof value === 'string' ? value : ''}
        onChange={setValue}
        isDisabled={isSubmitting}
      >
        <Label className="text-sm font-medium text-foreground">{request.message}</Label>
        {options.map((opt) => (
          <Radio key={opt.value} value={opt.value} isDisabled={opt.disabled}>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <Label>{opt.label}</Label>
              {opt.description && (
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              )}
            </Radio.Content>
          </Radio>
        ))}
        {/* "Other" escape hatch option */}
        <Radio value={OTHER_OPTION_VALUE}>
          <Radio.Control>
            <Radio.Indicator />
          </Radio.Control>
          <Radio.Content>
            <Label className="italic">{OTHER_OPTION_LABEL}</Label>
          </Radio.Content>
        </Radio>
      </RadioGroup>
      {otherInputField}
    </div>
  );
}
