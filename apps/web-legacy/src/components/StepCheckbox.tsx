import { Checkbox, Label } from '@heroui/react';
import { logPlanEvent, toggleStepCompletion } from '@shipyard/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { useUserIdentity } from '@/contexts/UserIdentityContext';

interface StepCheckboxProps {
  ydoc: Y.Doc;
  stepId: string;
  label: string;
}

export function StepCheckbox({ ydoc, stepId, label }: StepCheckboxProps) {
  const [checked, setChecked] = useState(false);
  const { actor } = useUserIdentity();

  useEffect(() => {
    const steps = ydoc.getMap<boolean>('stepCompletions');

    const update = () => setChecked(steps.get(stepId) || false);
    update();

    steps.observe(update);
    return () => steps.unobserve(update);
  }, [ydoc, stepId]);

  const handleToggle = () => {
    const newValue = !checked;
    toggleStepCompletion(ydoc, stepId, actor);

    /** Log step completion event */
    logPlanEvent(ydoc, 'step_completed', actor, {
      stepId,
      completed: newValue,
    });
  };

  return (
    <Checkbox isSelected={checked} onChange={handleToggle} className="py-1">
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Content>
        <Label className={checked ? 'line-through text-muted-foreground' : ''}>{label}</Label>
      </Checkbox.Content>
    </Checkbox>
  );
}
