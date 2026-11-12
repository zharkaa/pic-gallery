import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type DatePickerProps = {
  id?: string;
  /** Selected date as a local YYYY-MM-DD string, or an empty string. */
  value: string;
  onChange: (value: string) => void;
  /** Latest selectable date as YYYY-MM-DD. */
  max?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

/** Parse YYYY-MM-DD in local time so the calendar never shifts the day. */
function parseDateValue(value: string): Date | undefined {
  if (!value) return undefined;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDateValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** shadcn date picker: an outlined trigger that opens a single-month calendar. */
export function DatePicker({
  id,
  value,
  onChange,
  max,
  disabled,
  className,
  placeholder = "Pick a date",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const selectedDate = parseDateValue(value);
  const maxDate = parseDateValue(max ?? "");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start gap-2 font-normal",
              !selectedDate && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon />
        {selectedDate
          ? selectedDate.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : placeholder}
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            onChange(date ? toDateValue(date) : "");
            setOpen(false);
          }}
          disabled={maxDate ? { after: maxDate } : undefined}
          captionLayout="dropdown"
          startMonth={new Date(1900, 0)}
          endMonth={maxDate}
          defaultMonth={selectedDate ?? maxDate}
          autoFocus
        />

        {selectedDate && (
          <div className="border-t px-2 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
