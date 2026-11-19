import * as React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  dotClassName?: string;
}

interface CustomSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onValueChange,
  options,
  placeholder = 'Select option',
  className,
  ariaLabel,
}) => {
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange}>
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          'group flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">
          {selectedOption?.dotClassName && (
            <span className={cn('h-2 w-2 rounded-full shrink-0', selectedOption.dotClassName)} />
          )}
          <RadixSelect.Value placeholder={placeholder}>
            <span className="truncate">{selectedOption?.label ?? placeholder}</span>
          </RadixSelect.Value>
        </div>
        <RadixSelect.Icon asChild>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          <RadixSelect.Viewport className="space-y-0.5">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className="relative flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-medium outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {option.dotClassName && (
                    <span className={cn('h-2 w-2 rounded-full shrink-0', option.dotClassName)} />
                  )}
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </div>
                <RadixSelect.ItemIndicator>
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
};
