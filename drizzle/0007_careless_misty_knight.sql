ALTER TABLE `lifecycle_event` ADD `contact_point_id` text;--> statement-breakpoint
UPDATE `lifecycle_event`
SET `contact_point_id` = (
  SELECT `contact_point`.`id`
  FROM `transaction_request`
  JOIN `contact_point`
    ON `contact_point`.`person_id` = `lifecycle_event`.`person_id`
   AND `contact_point`.`contact_type` = 'work_email'
  WHERE `transaction_request`.`id` = `lifecycle_event`.`transaction_request_id`
    AND `transaction_request`.`person_id` = `lifecycle_event`.`person_id`
    AND `transaction_request`.`request_type` = 'hire'
    AND `transaction_request`.`status_code` = 'completed'
    AND NOT EXISTS (
      SELECT 1
      FROM `writeback_event`
      WHERE `writeback_event`.`contact_point_id` = `contact_point`.`id`
        AND `writeback_event`.`person_id` = `contact_point`.`person_id`
        AND `writeback_event`.`received_at` = `contact_point`.`created_at`
    )
  ORDER BY `contact_point`.`created_at`, `contact_point`.`id`
  LIMIT 1
)
WHERE `lifecycle_event`.`contact_point_id` IS NULL
  AND `lifecycle_event`.`event_type` = 'hire'
  AND `lifecycle_event`.`transaction_request_id` IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM `transaction_request`
    JOIN `contact_point`
      ON `contact_point`.`person_id` = `lifecycle_event`.`person_id`
     AND `contact_point`.`contact_type` = 'work_email'
    WHERE `transaction_request`.`id` = `lifecycle_event`.`transaction_request_id`
      AND `transaction_request`.`person_id` = `lifecycle_event`.`person_id`
      AND `transaction_request`.`request_type` = 'hire'
      AND `transaction_request`.`status_code` = 'completed'
      AND NOT EXISTS (
        SELECT 1
        FROM `writeback_event`
        WHERE `writeback_event`.`contact_point_id` = `contact_point`.`id`
          AND `writeback_event`.`person_id` = `contact_point`.`person_id`
          AND `writeback_event`.`received_at` = `contact_point`.`created_at`
      )
  );
