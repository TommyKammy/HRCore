WITH RECURSIVE
  `duplicate_transaction_request` AS (
    SELECT
      `rowid`,
      `id`,
      `correlation_id`
    FROM `transaction_request`
    WHERE `correlation_id` IS NOT NULL
      AND `rowid` NOT IN (
        SELECT min(`rowid`)
        FROM `transaction_request`
        WHERE `correlation_id` IS NOT NULL
        GROUP BY `correlation_id`
      )
  ),
  `dedupe_candidate`(`rowid`, `candidate`, `attempt`) AS (
    SELECT
      `rowid`,
      `correlation_id` || '#dedupe-' || `id`,
      0
    FROM `duplicate_transaction_request`
    UNION ALL
    SELECT
      `dedupe_candidate`.`rowid`,
      `duplicate_transaction_request`.`correlation_id` || '#dedupe-' || `duplicate_transaction_request`.`id` || '-' || (`dedupe_candidate`.`attempt` + 1),
      `dedupe_candidate`.`attempt` + 1
    FROM `dedupe_candidate`
    JOIN `duplicate_transaction_request`
      ON `duplicate_transaction_request`.`rowid` = `dedupe_candidate`.`rowid`
    WHERE EXISTS (
      SELECT 1
      FROM `transaction_request` `existing_transaction_request`
      WHERE `existing_transaction_request`.`correlation_id` = `dedupe_candidate`.`candidate`
    )
  )
UPDATE `transaction_request`
SET `correlation_id` = (
  SELECT `candidate`
  FROM `dedupe_candidate`
  WHERE `dedupe_candidate`.`rowid` = `transaction_request`.`rowid`
    AND NOT EXISTS (
      SELECT 1
      FROM `transaction_request` `existing_transaction_request`
      WHERE `existing_transaction_request`.`correlation_id` = `dedupe_candidate`.`candidate`
    )
  ORDER BY `attempt`
  LIMIT 1
)
WHERE `rowid` IN (
  SELECT `rowid`
  FROM `duplicate_transaction_request`
)
  AND `rowid` NOT IN (
    SELECT min(`rowid`)
    FROM `transaction_request`
    WHERE `correlation_id` IS NOT NULL
    GROUP BY `correlation_id`
  );--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_request_correlation_unique` ON `transaction_request` (`correlation_id`);
