/**
 * Choice input component for input requests.
 * Supports single-select (radio buttons) and multi-select (checkboxes).
 * Auto-switches to dropdown UI for 9+ options.
 * Includes "Other" escape hatch option for custom user responses.
 */

import {
  Alert,
  Button,
  Checkbox,
  CheckboxGroup,
  ComboBox,
  Input,
  Label,
  ListBox,
  Radio,
  RadioGroup,
  TextField,
} from '@heroui/react';
import { CHOICE_DROPDOWN_THRESHOLD, normalizeChoiceOptions } from '@shipyard/schema';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
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

  useEffect(() => {
    if (isOtherSelected && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [isOtherSelected]);

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

  const options = normalizeChoiceOptions(rawOptions);

  const shouldUseDropdown =
    request.displayAs === 'dropdown' ||
    (!request.displayAs && !request.multiSelect && options.length >= CHOICE_DROPDOWN_THRESHOLD);

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

  if (shouldUseDropdown) {
    const selectedValue = typeof value === 'string' ? value : '';
    return (
      <div className="space-y-3">
        <MarkdownContent content={request.message} variant="default" />
        <ComboBox
          selectedKey={selectedValue || null}
          onSelectionChange={(key) => setValue(key ? String(key) : '')}
          isDisabled={isSubmitting}
          isRequired
        >
          <ComboBox.InputGroup className="relative">
            <Input
              placeholder={request.placeholder || 'Select an option...'}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              autoFocus
              className="pr-10"
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 min-w-0 p-0"
              isIconOnly
            >
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </Button>
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
              {/* "Other" escape hatch option */}
              <ListBox.Item key={OTHER_OPTION_VALUE} id={OTHER_OPTION_VALUE} textValue="Other">
                <span className="italic">{OTHER_OPTION_LABEL}</span>
              </ListBox.Item>
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>
        {otherInputField}
      </div>
    );
  }

  if (request.multiSelect) {
    return (
      <div className="space-y-3">
        <MarkdownContent content={request.message} variant="default" />
        <CheckboxGroup
          isRequired
          value={Array.isArray(value) ? value : []}
          onChange={setValue}
          isDisabled={isSubmitting}
        >
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

  return (
    <div className="space-y-3">
      <MarkdownContent content={request.message} variant="default" />
      <RadioGroup
        isRequired
        value={typeof value === 'string' ? value : ''}
        onChange={setValue}
        isDisabled={isSubmitting}
      >
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
