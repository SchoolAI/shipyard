import { toggleStepCompletion } from '@peer-plan/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

interface StepCheckboxProps {
  ydoc: Y.Doc;
  stepId: string;
  label: string;
}

export function StepCheckbox({ ydoc, stepId, label }: StepCheckboxProps) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const steps = ydoc.getMap<boolean>('stepCompletions');

    const update = () => setChecked(steps.get(stepId) || false);
    update(); // Initial read

    steps.observe(update);
    return () => steps.unobserve(update);
  }, [ydoc, stepId]);

  const handleToggle = () => {
    toggleStepCompletion(ydoc, stepId);
  };

  return (
    <label className="flex items-center gap-2 cursor-pointer py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={handleToggle}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className={checked ? 'line-through text-gray-400' : ''}>{label}</span>
    </label>
  );
}
