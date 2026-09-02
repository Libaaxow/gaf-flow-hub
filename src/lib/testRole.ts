import { useEffect, useState } from 'react';

/**
 * Workflow Test Mode.
 * Lets an admin temporarily view the app as Admin Manager / Board Member / Accountant
 * so the governance workflow can be tested end to end.
 * Only affects what the UI shows — database permissions stay tied to the real account.
 */
export type TestRole = 'admin' | 'board' | 'accountant' | null;

const KEY = 'gaf_test_role';
const EVT = 'gaf-test-role-change';

export const TEST_ROLE_LABEL: Record<string, string> = {
  admin: 'Admin Manager',
  board: 'Board Member / Director',
  accountant: 'Accountant / Finance',
};

export const getTestRole = (): TestRole => {
  try {
    return (localStorage.getItem(KEY) as TestRole) || null;
  } catch {
    return null;
  }
};

export const setTestRole = (role: TestRole) => {
  try {
    if (role) localStorage.setItem(KEY, role);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVT));
};

export const useTestRole = (): TestRole => {
  const [role, setRole] = useState<TestRole>(getTestRole());
  useEffect(() => {
    const handler = () => setRole(getTestRole());
    window.addEventListener(EVT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
  return role;
};

/** Real role wins unless the signed-in user is an admin running Test Mode. */
export const applyTestRole = (actualRoles: string[], testRole: TestRole): string[] => {
  if (!testRole) return actualRoles;
  if (!actualRoles.includes('admin')) return actualRoles;
  return [testRole];
};
