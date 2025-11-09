-- Add new status 'ready_for_collection' to order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ready_for_collection';