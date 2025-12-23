-- Make the foreign key constraint cascade on delete
ALTER TABLE public.sales_order_requests 
DROP CONSTRAINT IF EXISTS sales_order_requests_linked_invoice_id_fkey;

ALTER TABLE public.sales_order_requests
ADD CONSTRAINT sales_order_requests_linked_invoice_id_fkey
FOREIGN KEY (linked_invoice_id) REFERENCES public.invoices(id)
ON DELETE SET NULL;