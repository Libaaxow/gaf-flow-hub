import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, Mail } from 'lucide-react';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';

interface FY {
  year_label: string;
  start_date: string;
  end_date: string;
  status: string;
}

export function ShareYearCycleBanner() {
  const [year, setYear] = useState<FY | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('fiscal_years')
        .select('year_label, start_date, end_date, status')
        .eq('status', 'open')
        .order('end_date', { ascending: false })
        .limit(1);
      if (data && data.length) setYear(data[0] as FY);
    })();
  }, []);

  if (!year) return null;

  const daysLeft = differenceInCalendarDays(parseISO(year.end_date), new Date());
  const closing = format(parseISO(year.end_date), 'dd MMMM yyyy');

  return (
    <Card className="border-primary/30 bg-primary/5 min-w-0">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary shrink-0" />
          <span className="font-semibold text-sm">Share Year Cycle is Active</span>
          <Badge className="bg-green-600 hover:bg-green-600">{year.year_label} — Open</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-background p-3 min-w-0">
            <p className="text-xs text-muted-foreground">Cycle period</p>
            <p className="text-sm font-medium">
              {format(parseISO(year.start_date), 'dd MMM yyyy')} → {format(parseISO(year.end_date), 'dd MMM yyyy')}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-3 min-w-0">
            <p className="text-xs text-muted-foreground">Closes automatically on</p>
            <p className="text-sm font-medium">{closing}</p>
          </div>
          <div className="rounded-lg border bg-background p-3 min-w-0">
            <p className="text-xs text-muted-foreground">Time remaining</p>
            <p className={`text-sm font-bold ${daysLeft <= 30 ? 'text-destructive' : ''}`}>{daysLeft} days</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          When the cycle closes, the full company report (assets, cash, debts, receivables and your personal share
          settlement) is emailed to you automatically and the new year opens the next day.
        </p>
      </CardContent>
    </Card>
  );
}
