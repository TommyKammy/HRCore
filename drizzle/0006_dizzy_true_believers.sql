UPDATE `transaction_request`
SET `correlation_id` = `correlation_id` || '#dedupe-' || `id`
WHERE `correlation_id` IS NOT NULL
  AND `rowid` NOT IN (
    SELECT min(`rowid`)
    FROM `transaction_request`
    WHERE `correlation_id` IS NOT NULL
    GROUP BY `correlation_id`
  );--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_request_correlation_unique` ON `transaction_request` (`correlation_id`);
