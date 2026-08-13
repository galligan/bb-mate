import type { ReactNode } from "react";

import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

interface NativeSettingsSectionProps {
  action?: ReactNode;
  cardClassName?: string;
  children: ReactNode;
  className?: string;
  description?: string;
  headingId: string;
  title: string;
}

export function NativeSettingsSection({
  action,
  cardClassName,
  children,
  className,
  description,
  headingId,
  title,
}: NativeSettingsSectionProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn("space-y-3", className)}
      data-native-settings-section={title}
    >
      <div
        className={cn(
          "flex justify-between gap-4",
          description ? "items-start" : "items-center",
        )}
      >
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-snug text-subtle-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <Card className={cn("px-4 py-3.5", cardClassName)}>{children}</Card>
    </section>
  );
}

interface NativeSettingRowProps {
  children: ReactNode;
  description?: string;
  label: string;
}

export function NativeSettingRow({
  children,
  description,
  label,
}: NativeSettingRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 sm:flex-row sm:justify-between sm:gap-5",
        description ? "sm:items-start" : "sm:items-center",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-normal text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-snug text-subtle-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 sm:flex sm:justify-end">{children}</div>
    </div>
  );
}
