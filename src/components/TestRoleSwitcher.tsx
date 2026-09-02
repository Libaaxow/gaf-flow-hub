import { FlaskConical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TEST_ROLE_LABEL, TestRole, setTestRole, useTestRole } from '@/lib/testRole';

const ROLES: Exclude<TestRole, null>[] = ['admin', 'board', 'accountant'];

/**
 * Temporary control panel shown only to real admins so the
 * Admin → Board → Finance governance workflow can be tested end to end.
 */
export const TestRoleSwitcher = () => {
  const testRole = useTestRole();

  return (
    <div className="border-b bg-warning/10">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="flex items-center gap-1 text-xs font-semibold text-warning">
          <FlaskConical className="h-4 w-4" /> Workflow Test Mode
        </span>
        {ROLES.map((r) => (
          <Button
            key={r}
            size="sm"
            variant={testRole === r ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setTestRole(r)}
          >
            {TEST_ROLE_LABEL[r]}
          </Button>
        ))}
        {testRole && (
          <>
            <Badge variant="secondary" className="text-[11px]">Viewing as {TEST_ROLE_LABEL[testRole]}</Badge>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setTestRole(null)}>
              <X className="h-3 w-3 mr-1" /> Exit test mode
            </Button>
          </>
        )}
        <span className="text-[11px] text-muted-foreground">
          Changes what you see only — your real account permissions are unchanged.
        </span>
      </div>
    </div>
  );
};
