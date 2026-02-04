interface InputRequestBase {
  id: string;
  message: string;
  status: 'pending' | 'answered' | 'declined' | 'cancelled';
  createdAt: number;
  expiresAt: number;
  response: string | number | boolean | string[] | null;
  answeredAt: number | null;
  answeredBy: string | null;
  isBlocker: boolean | null;
}

export interface TextInputRequest extends InputRequestBase {
  type: 'text';
  defaultValue: string | null;
  placeholder: string | null;
}

export interface MultilineInputRequest extends InputRequestBase {
  type: 'multiline';
  defaultValue: string | null;
  placeholder: string | null;
}

export interface ChoiceOption {
  label: string;
  value: string;
  description: string | null;
  disabled?: boolean;
}

export interface ChoiceInputRequest extends InputRequestBase {
  type: 'choice';
  options: ChoiceOption[];
  multiSelect: boolean | null;
  displayAs: 'radio' | 'checkbox' | 'dropdown' | null;
  placeholder: string | null;
}

export interface ConfirmInputRequest extends InputRequestBase {
  type: 'confirm';
}

export interface NumberInputRequest extends InputRequestBase {
  type: 'number';
  min: number | null;
  max: number | null;
  format: 'integer' | 'decimal' | 'currency' | 'percentage' | null;
  defaultValue: number | null;
}

export interface EmailInputRequest extends InputRequestBase {
  type: 'email';
  domain?: string;
}

export interface DateInputRequest extends InputRequestBase {
  type: 'date';
  min?: string;
  max?: string;
}

export interface RatingInputRequest extends InputRequestBase {
  type: 'rating';
  min?: number;
  max?: number;
  style?: 'stars' | 'numbers' | 'emoji';
  labels?: {
    low?: string;
    high?: string;
  };
}

export type InputRequest =
  | TextInputRequest
  | MultilineInputRequest
  | ChoiceInputRequest
  | ConfirmInputRequest
  | NumberInputRequest
  | EmailInputRequest
  | DateInputRequest
  | RatingInputRequest;

export interface BaseInputProps<T extends InputRequest = InputRequest> {
  request: T;
  value: string | string[];
  setValue: (val: string | string[]) => void;
  isSubmitting: boolean;
}

export interface ChoiceInputProps extends BaseInputProps<ChoiceInputRequest> {
  customInput: string;
  setCustomInput: (val: string) => void;
  isOtherSelected: boolean;
}

export interface ConfirmInputProps extends BaseInputProps<ConfirmInputRequest> {
  remainingTime: number;
  onConfirmResponse: (response: string) => void;
}

export interface RatingInputProps extends BaseInputProps<RatingInputRequest> {
  customInput: string;
  setCustomInput: (val: string) => void;
  isOtherSelected: boolean;
  isNaSelected: boolean;
}

export const CHOICE_DROPDOWN_THRESHOLD = 9;

export function normalizeChoiceOptions(options: (string | ChoiceOption)[]): ChoiceOption[] {
  return options.map((opt) => {
    if (typeof opt === 'string') {
      return { label: opt, value: opt, description: null };
    }
    return opt;
  });
}
