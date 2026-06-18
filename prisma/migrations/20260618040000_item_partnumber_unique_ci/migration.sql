-- Enforce GLOBAL, CASE-INSENSITIVE uniqueness of Item.partNumber.
-- A partial functional unique index: case-insensitive (lower()) and excluding
-- NULL/blank part numbers so multiple items may still have no part number.
-- Not expressible in the Prisma schema, so it lives here as raw SQL; the API
-- also pre-checks case-insensitively to return a friendly 409.
CREATE UNIQUE INDEX "Item_partNumber_lower_key"
  ON "Item" (lower("partNumber"))
  WHERE "partNumber" IS NOT NULL AND "partNumber" <> '';
