DROP TABLE IF EXISTS `__transaction_request_correlation_dedupe`;--> statement-breakpoint
CREATE TEMP TABLE `__transaction_request_correlation_dedupe` AS
WITH RECURSIVE
  `duplicate_transaction_request` AS (
    SELECT
      `rowid`,
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
      `correlation_id` || '#dedupe-rowid-' || `rowid`,
      0
    FROM `duplicate_transaction_request`
    UNION ALL
    SELECT
      `dedupe_candidate`.`rowid`,
      `duplicate_transaction_request`.`correlation_id` || '#dedupe-rowid-' || `duplicate_transaction_request`.`rowid` || '-' || (`dedupe_candidate`.`attempt` + 1),
      `dedupe_candidate`.`attempt` + 1
    FROM `dedupe_candidate`
    JOIN `duplicate_transaction_request`
      ON `duplicate_transaction_request`.`rowid` = `dedupe_candidate`.`rowid`
    WHERE `dedupe_candidate`.`attempt` < 1000
      AND EXISTS (
        SELECT 1
        FROM `transaction_request` `existing_transaction_request`
        WHERE `existing_transaction_request`.`correlation_id` = `dedupe_candidate`.`candidate`
      )
  ),
  `available_dedupe_candidate` AS (
    SELECT
      `rowid`,
      `candidate`,
      row_number() OVER (
        PARTITION BY `rowid`
        ORDER BY `attempt`
      ) AS `candidate_rank`
    FROM `dedupe_candidate`
    WHERE NOT EXISTS (
      SELECT 1
      FROM `transaction_request` `existing_transaction_request`
      WHERE `existing_transaction_request`.`correlation_id` = `dedupe_candidate`.`candidate`
    )
  )
SELECT
  `rowid`,
  `candidate`
FROM `available_dedupe_candidate`
WHERE `candidate_rank` = 1;--> statement-breakpoint
UPDATE `transaction_request`
SET `correlation_id` = (
  SELECT `candidate`
  FROM `__transaction_request_correlation_dedupe`
  WHERE `__transaction_request_correlation_dedupe`.`rowid` = `transaction_request`.`rowid`
  LIMIT 1
)
WHERE `rowid` IN (
  SELECT `rowid`
  FROM `__transaction_request_correlation_dedupe`
);--> statement-breakpoint
DROP TABLE `__transaction_request_correlation_dedupe`;--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_request_correlation_unique` ON `transaction_request` (`correlation_id`);
