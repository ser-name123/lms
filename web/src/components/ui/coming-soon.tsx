import { Construction } from "lucide-react";

import { Button } from "./button";
import { Card } from "./card";

export function ComingSoon({ section }: { section: string }) {
  return (
    <Card className="grid place-items-center px-6 py-24 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-surface-2 text-ink-3">
        <Construction className="size-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold tracking-tight text-ink">
        {section} is not built yet
      </h2>
      <p className="mt-1 max-w-sm text-sm text-ink-3">
        The shell, design tokens and data layer are in place — this screen just needs its table
        and forms wiring up to the API.
      </p>
      <Button variant="outline" size="sm" className="mt-5">
        View spec
      </Button>
    </Card>
  );
}
