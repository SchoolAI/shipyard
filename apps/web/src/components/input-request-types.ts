import type { TaskInputRequest } from '@shipyard/loro-schema';

export type InputRequestItem = TaskInputRequest[number];

export type TextInputRequest = Extract<InputRequestItem, { type: 'text' }>;
export type MultilineInputRequest = Extract<InputRequestItem, { type: 'multiline' }>;
export type ChoiceInputRequest = Extract<InputRequestItem, { type: 'choice' }>;
export type ConfirmInputRequest = Extract<InputRequestItem, { type: 'confirm' }>;
export type NumberInputRequest = Extract<InputRequestItem, { type: 'number' }>;
export type MultiInputRequest = Extract<InputRequestItem, { type: 'multi' }>;

export type SingleInputRequest =
  | TextInputRequest
  | MultilineInputRequest
  | ChoiceInputRequest
  | ConfirmInputRequest
  | NumberInputRequest;

export type AnyInputRequest = InputRequestItem;
