import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Github, ExternalLink, Save, CheckCircle2, XCircle } from 'lucide-react';

const isValidRepoUrl = (value: string) =>
  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(value.trim());

const GitHubSettings = () => {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('integration_settings')
          .select('id, github_repo_url')
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          setSettingsId(data.id);
          setRepoUrl(data.github_repo_url || '');
          setSavedUrl(data.github_repo_url || '');
        }
      } catch (error: any) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    const checkRole = async () => {
      if (!user) return;
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
      setIsAdmin((data || []).some((r: any) => r.role === 'admin'));
    };

    load();
    checkRole();
  }, [user, toast]);

  const handleSave = async () => {
    const trimmed = repoUrl.trim();
    if (trimmed && !isValidRepoUrl(trimmed)) {
      toast({
        title: 'Invalid link',
        description: 'Use a link like https://github.com/owner/repository',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        github_repo_url: trimmed || null,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };

      if (settingsId) {
        const { error } = await supabase
          .from('integration_settings')
          .update(payload)
          .eq('id', settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('integration_settings')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        setSettingsId(data.id);
      }

      setSavedUrl(trimmed);
      toast({ title: 'Saved', description: 'GitHub settings updated' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const connected = Boolean(savedUrl);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-24 w-24 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
            <p className="mt-4 text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">GitHub Settings</h1>
          <p className="text-muted-foreground">
            See whether this project is connected to a GitHub repository.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              Connection status
            </CardTitle>
            <CardDescription>
              Code sync is set up in Lovable (chat + menu → GitHub). Record the repository link here so
              your team can find it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Repository</p>
                <p className="truncate text-sm text-muted-foreground">
                  {connected ? savedUrl : 'No repository linked yet'}
                </p>
              </div>
              <Badge variant={connected ? 'default' : 'secondary'} className="ml-3 flex-shrink-0 gap-1">
                {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {connected ? 'Connected' : 'Not connected'}
              </Badge>
            </div>

            {connected && (
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <a href={savedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open repository
                </a>
              </Button>
            )}

            <div className="space-y-2">
              <Label htmlFor="repo-url">Repository link</Label>
              <Input
                id="repo-url"
                value={repoUrl}
                placeholder="https://github.com/owner/repository"
                disabled={!isAdmin}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {isAdmin
                  ? 'Leave empty to mark the project as not connected.'
                  : 'Only administrators can change this setting.'}
              </p>
            </div>

            {isAdmin && (
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default GitHubSettings;
