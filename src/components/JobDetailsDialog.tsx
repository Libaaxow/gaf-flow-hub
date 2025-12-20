import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Building2,
  Phone,
  Mail,
  FileText,
  Calendar,
  Clock,
  Download,
  Upload,
  CheckCircle,
  Sparkles,
  Paperclip,
} from 'lucide-react';

interface JobDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: {
    id: string;
    customer_name: string;
    company_name?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    description: string;
    notes?: string | null;
    status: string;
    created_at: string;
    processed_at?: string | null;
    creator?: { full_name: string } | null;
    designer?: { full_name: string } | null;
  } | null;
  files?: Array<{
    id: string;
    file_name: string;
    file_path: string;
    created_at: string;
  }>;
  onDownloadFile?: (filePath: string, fileName: string) => void;
  onUploadFile?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmitDesign?: () => void;
  showUpload?: boolean;
  showSubmit?: boolean;
  uploading?: boolean;
  variant?: 'designer' | 'sales' | 'accountant';
}

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', className: 'bg-amber-500/20 text-amber-600 border-amber-500/30', icon: Clock },
  processed: { label: 'Processed', className: 'bg-blue-500/20 text-blue-600 border-blue-500/30', icon: CheckCircle },
  in_design: { label: 'In Design', className: 'bg-violet-500/20 text-violet-600 border-violet-500/30', icon: Sparkles },
  design_submitted: { label: 'Design Ready', className: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30', icon: CheckCircle },
  in_print: { label: 'In Print', className: 'bg-orange-500/20 text-orange-600 border-orange-500/30', icon: FileText },
  printed: { label: 'Printed', className: 'bg-teal-500/20 text-teal-600 border-teal-500/30', icon: CheckCircle },
  collected: { label: 'Collected', className: 'bg-green-500/20 text-green-600 border-green-500/30', icon: CheckCircle },
  completed: { label: 'Completed', className: 'bg-green-500/20 text-green-600 border-green-500/30', icon: CheckCircle },
};

export const JobDetailsDialog = ({
  open,
  onOpenChange,
  request,
  files = [],
  onDownloadFile,
  onUploadFile,
  onSubmitDesign,
  showUpload = false,
  showSubmit = false,
  uploading = false,
  variant = 'designer',
}: JobDetailsDialogProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  if (!request) return null;

  const status = statusConfig[request.status] || { 
    label: request.status, 
    className: 'bg-secondary text-secondary-foreground', 
    icon: Clock 
  };
  const StatusIcon = status.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden bg-gradient-to-br from-background via-background to-muted/30">
        {/* Decorative Header Background */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent pointer-events-none" />
        
        <DialogHeader className="relative px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold tracking-tight">
                Job Details
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                ID: #{request.id.slice(0, 8)}
              </p>
            </div>
            <Badge 
              variant="outline" 
              className={`${status.className} px-3 py-1.5 text-sm font-medium border flex items-center gap-1.5`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-120px)]">
          <div className="px-6 pb-6 space-y-6">
            {/* Customer Section */}
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Customer Information</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="group rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <User className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium uppercase tracking-wider">Name</span>
                  </div>
                  <p className="font-semibold text-foreground">{request.customer_name}</p>
                </div>

                <div className="group rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium uppercase tracking-wider">Company</span>
                  </div>
                  <p className="font-semibold text-foreground">{request.company_name || '—'}</p>
                </div>

                {request.customer_phone && (
                  <div className="group rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Phone className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium uppercase tracking-wider">Phone</span>
                    </div>
                    <p className="font-semibold text-foreground">{request.customer_phone}</p>
                  </div>
                )}

                {request.customer_email && (
                  <div className="group rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium uppercase tracking-wider">Email</span>
                    </div>
                    <p className="font-semibold text-foreground truncate">{request.customer_email}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* Job Details Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-violet-500" />
                </div>
                <h3 className="font-semibold text-lg">Job Details</h3>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border bg-card/50 p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <FileText className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium uppercase tracking-wider">Description</span>
                  </div>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">{request.description}</p>
                </div>

                {request.notes && (
                  <div className="rounded-xl border bg-amber-500/5 border-amber-500/20 p-4">
                    <div className="flex items-center gap-2 text-amber-600 mb-2">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium uppercase tracking-wider">Notes</span>
                    </div>
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">{request.notes}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border bg-card/50 p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium uppercase tracking-wider">Created</span>
                    </div>
                    <p className="font-semibold text-foreground">
                      {format(new Date(request.created_at), 'MMMM do, yyyy')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(request.created_at), 'h:mm a')}
                    </p>
                  </div>

                  {request.creator && (
                    <div className="rounded-xl border bg-card/50 p-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <User className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wider">Created By</span>
                      </div>
                      <p className="font-semibold text-foreground">{request.creator.full_name}</p>
                    </div>
                  )}

                  {request.designer && (
                    <div className="rounded-xl border bg-violet-500/5 border-violet-500/20 p-4">
                      <div className="flex items-center gap-2 text-violet-600 mb-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wider">Designer</span>
                      </div>
                      <p className="font-semibold text-foreground">{request.designer.full_name}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator className="bg-border/50" />

            {/* Design Files Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Paperclip className="h-4 w-4 text-emerald-500" />
                  </div>
                  <h3 className="font-semibold text-lg">Design Files</h3>
                  {files.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {files.length}
                    </Badge>
                  )}
                </div>
                
                {showUpload && (
                  <>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={onUploadFile}
                      multiple
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      {uploading ? 'Uploading...' : 'Upload Files'}
                    </Button>
                  </>
                )}
              </div>

              {files.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed bg-muted/30 p-8 text-center">
                  <Paperclip className="mx-auto h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No files uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="group flex items-center justify-between rounded-xl border bg-card/50 p-4 transition-all hover:bg-card hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{file.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(file.created_at), 'MMM d, yyyy • h:mm a')}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownloadFile?.(file.file_path, file.file_name)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            {showSubmit && (
              <>
                <Separator className="bg-border/50" />
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={onSubmitDesign}
                    className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Submit Design
                  </Button>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
