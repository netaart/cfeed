-- Status is now open (unmarked) / resolved / spam; the 0001 CHECK still allows the old values but the API rejects them.
UPDATE feedback SET status = 'open' WHERE status = 'in_progress';
UPDATE feedback SET status = 'resolved' WHERE status = 'closed';
