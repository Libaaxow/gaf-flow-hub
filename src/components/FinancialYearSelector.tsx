import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarRange } from 'lucide-react';
import { useFinancialYear } from '@/lib/financialYear';

interface Props {
  className?: string;
}

/**
 * Financial year picker (1 Jan – 31 Dec). Income figures follow this choice;
 * outstanding debt, opening balances and assets always carry forward.
 */
export function FinancialYearSelector({ className = '' }: Props) {
  const { year, setYear, years, isCurrentYear } = useFinancialYear();

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
      <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              Financial Year {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isCurrentYear ? (
        <Badge variant="secondary" className="shrink-0">Current</Badge>
      ) : (
        <Badge variant="outline" className="shrink-0">Archive</Badge>
      )}
    </div>
  );
}
